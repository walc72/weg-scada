import { describe, expect, it } from 'vitest'
import { serieDe } from './tendencia'
import type { Series } from './tendencia'
import type { AppConfig } from '../types'
import type { Nodo } from './unifilar'

const t1 = '2026-10-30T10:00:00Z', t2 = '2026-10-30T10:05:00Z'
const ms = (t: string) => Date.parse(t)
const nodo = (tipo: string, extra: Partial<Nodo>): Nodo => ({ id: 'n1', tipo, x: 0, y: 0, rot: 0, ...extra })
const cfg = {
  devices: [], meters: [], gateways: [],
  reguladores: [{ name: 'G1', banco: 'B' }, { name: 'G2', banco: 'B' }, { name: 'G3', banco: 'B', enabled: false }, { name: 'G4' }],
} as unknown as AppConfig
const series = {
  drives: [{ _time: t1, name: 'P1', current: 40 }, { _time: t2, name: 'P1', current: 42 }, { _time: t1, name: 'P2', current: 9 }],
  meters: [{ _time: t1, name: 'M1', power: 650000 }],
  flows: [{ _time: t2, name: 'Q1', flow: 120 }],
  campo: [
    { _time: t1, name: 'R1', ia: 110, i: 5 },
    { _time: t1, name: 'G1', tap: 3, v: 218 }, { _time: t1, name: 'G2', tap: 4, v: 219 },
    { _time: t2, name: 'G1', tap: 4, v: 220 },
    { _time: t1, name: 'G4', tap: -1, v: 120 },
  ],
} as unknown as Series

describe('serieDe', () => {
  it('bomba: corriente de su fila, ordenada', () => {
    const [g] = serieDe(nodo('bomba', { ref: 'P1' }), series, cfg)
    expect(g).toMatchObject({ titulo: 'Corriente', unidad: 'A' })
    expect(g.datos).toEqual([{ ts: ms(t1), P1: 40 }, { ts: ms(t2), P1: 42 }])
  })

  it('medidor en kW y caudalímetro en L/s', () => {
    expect(serieDe(nodo('medidor', { ref: 'M1' }), series, cfg)[0]).toMatchObject({ titulo: 'Potencia', unidad: 'kW', datos: [{ ts: ms(t1), M1: 650 }] })
    expect(serieDe(nodo('caudalimetro', { ref: 'Q1' }), series, cfg)[0]).toMatchObject({ unidad: 'L/s', datos: [{ ts: ms(t2), Q1: 120 / 3.6 }] })
  })

  it('reco: corriente de fase A (ia) antes que i', () => {
    expect(serieDe(nodo('reco', { ref: 'R1' }), series, cfg)[0].datos).toEqual([{ ts: ms(t1), R1: 110 }])
  })

  it('banco: tap en escalones y tensión, una línea por fase habilitada', () => {
    const [v, tap] = serieDe(nodo('reg', { banco: 'B' }), series, cfg)
    expect(tap).toMatchObject({ titulo: 'Tap', escalon: true })
    expect(tap.lineas.map(l => l.key)).toEqual(['G1', 'G2'])
    expect(tap.datos).toEqual([{ ts: ms(t1), G1: 3, G2: 4 }, { ts: ms(t2), G1: 4 }])
    expect(v).toMatchObject({ titulo: 'Tensión de carga', unidad: 'V' })
    expect(v.datos[0]).toEqual({ ts: ms(t1), G1: 218, G2: 219 })
  })

  it('regulador suelto: una línea', () => {
    const [, tap] = serieDe(nodo('reg', { ref: 'G4' }), series, cfg)
    expect(tap.lineas.map(l => l.key)).toEqual(['G4'])
    expect(tap.datos).toEqual([{ ts: ms(t1), G4: -1 }])
  })

  it('medidor y bomba: variables para elegir de a una; solo las que tienen datos (la primera siempre)', () => {
    const m = serieDe(nodo('medidor', { ref: 'M1' }), { meters: [{ _time: t1, name: 'M1', power: 650000, pf: 0.95 }] } as unknown as Series, cfg)
    expect(m.map(g => g.titulo)).toEqual(['Potencia', 'Factor de potencia'])
    expect(m.every(g => g.alterna)).toBe(true)
    const b = serieDe(nodo('bomba', { ref: 'P1' }), { drives: [{ _time: t1, name: 'P1', motor_speed: 1480 }] } as unknown as Series, cfg)
    expect(b.map(g => g.titulo)).toEqual(['Corriente', 'Velocidad'])
  })

  it('serieDe colorea por magnitud y por fase', () => {
    const [i] = serieDe(nodo('bomba', { ref: 'P1' }), series, cfg)
    expect(i.titulo).toBe('Corriente')
    expect(i.lineas[0].color).toBe('var(--mag-corriente)')
    const cfg3 = { ...cfg, reguladores: [{ name: 'G1', banco: 'B' }, { name: 'G2', banco: 'B' }, { name: 'G3', banco: 'B' }] } as unknown as AppConfig
    const b = serieDe(nodo('reg', { banco: 'B' }), series, cfg3)
    expect(b[0].titulo).toBe('Tensión de carga')
    expect(b[0].lineas.map(l => l.color)).toEqual(['var(--fase-a)', 'var(--fase-b)', 'var(--fase-c)'])
    expect(b.every(g => g.alterna)).toBe(true)
  })

  it('sin filas o tipo sin tendencia', () => {
    expect(serieDe(nodo('bomba', { ref: 'X' }), series, cfg)[0].datos).toEqual([])
    expect(serieDe(nodo('bomba', { ref: 'P1' }), {}, cfg)[0].datos).toEqual([])
    expect(serieDe(nodo('comm', { ref: 'C' }), series, cfg)).toEqual([])
  })
})

describe('serieDe de un generador', () => {
  const g = (campo: unknown[]) => serieDe(nodo('gen', { ref: 'GE' }), { campo } as unknown as Series, cfg)

  it('primero Potencia en kW, luego las variables con datos', () => {
    const r = g([{ _time: t1, name: 'GE', kw: 150, hz: 50 }])
    expect(r.map(x => x.titulo)).toEqual(['Potencia', 'Frecuencia'])
    expect(r[0]).toMatchObject({ unidad: 'kW', datos: [{ ts: ms(t1), GE: 150 }] })
  })

  it('combustible y batería salen de las mediciones libres x_<slug>', () => {
    const r = g([{ _time: t1, name: 'GE', kw: 1, x_nivel_de_combustible: 80, x_tension_de_bateria: 27.4 }])
    expect(r.find(x => x.titulo === 'Combustible')).toMatchObject({ unidad: '%', datos: [{ ts: ms(t1), GE: 80 }] })
    expect(r.find(x => x.titulo === 'Batería')).toMatchObject({ unidad: 'V' })
  })

  it('sin datos de batería no aparece el gráfico', () => {
    expect(g([{ _time: t1, name: 'GE', kw: 1 }]).map(x => x.titulo)).not.toContain('Batería')
  })
})
