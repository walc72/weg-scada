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

  it('medidor en kW y caudalímetro en m³/h', () => {
    expect(serieDe(nodo('medidor', { ref: 'M1' }), series, cfg)[0]).toMatchObject({ titulo: 'Potencia', unidad: 'kW', datos: [{ ts: ms(t1), M1: 650 }] })
    expect(serieDe(nodo('caudalimetro', { ref: 'Q1' }), series, cfg)[0]).toMatchObject({ unidad: 'm³/h', datos: [{ ts: ms(t2), Q1: 120 }] })
  })

  it('reco: corriente de fase A (ia) antes que i', () => {
    expect(serieDe(nodo('reco', { ref: 'R1' }), series, cfg)[0].datos).toEqual([{ ts: ms(t1), R1: 110 }])
  })

  it('banco: tap en escalones y tensión, una línea por fase habilitada', () => {
    const [tap, v] = serieDe(nodo('reg', { banco: 'B' }), series, cfg)
    expect(tap).toMatchObject({ titulo: 'Tap', escalon: true })
    expect(tap.lineas.map(l => l.key)).toEqual(['G1', 'G2'])
    expect(tap.datos).toEqual([{ ts: ms(t1), G1: 3, G2: 4 }, { ts: ms(t2), G1: 4 }])
    expect(v).toMatchObject({ titulo: 'Tensión de carga', unidad: 'V' })
    expect(v.datos[0]).toEqual({ ts: ms(t1), G1: 218, G2: 219 })
  })

  it('regulador suelto: una línea', () => {
    const [tap] = serieDe(nodo('reg', { ref: 'G4' }), series, cfg)
    expect(tap.lineas.map(l => l.key)).toEqual(['G4'])
    expect(tap.datos).toEqual([{ ts: ms(t1), G4: -1 }])
  })

  it('sin filas o tipo sin tendencia', () => {
    expect(serieDe(nodo('bomba', { ref: 'X' }), series, cfg)[0].datos).toEqual([])
    expect(serieDe(nodo('bomba', { ref: 'P1' }), {}, cfg)[0].datos).toEqual([])
    expect(serieDe(nodo('comm', { ref: 'C' }), series, cfg)).toEqual([])
  })
})
