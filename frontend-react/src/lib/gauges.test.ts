import { describe, it, expect } from 'vitest'
import { sanearGauges, zonaDe, lectura, MAX_GAUGES, type Gauge } from './gauges'
import type { AppConfig, CampoState, Drive, Meter } from '../types'

const vacio = { drives: new Map<string, Drive>(), meters: new Map<string, Meter>(), campo: new Map<string, CampoState>() }

describe('sanearGauges', () => {
  it('descarta fuentes, variables y nombres inválidos', () => {
    expect(sanearGauges(null)).toEqual([])
    expect(sanearGauges([{ src: 'x', name: 'a', field: 'current' }, { src: 'drive', name: '', field: 'current' },
      { src: 'drive', name: 'B1', field: 'nope' }])).toEqual([])
    expect(sanearGauges([{ src: 'drive', name: 'B1', field: 'current', min: 'x', alerta: 80 }]))
      .toEqual([{ src: 'drive', name: 'B1', field: 'current', alerta: 80 }])
  })
  it('anula min/max invertidos y corta en el máximo', () => {
    expect(sanearGauges([{ src: 'meter', name: 'M', field: 'pf', min: 5, max: 1 }])[0]).toEqual({ src: 'meter', name: 'M', field: 'pf' })
    const muchos = Array.from({ length: 20 }, () => ({ src: 'drive', name: 'B', field: 'power' }))
    expect(sanearGauges(muchos)).toHaveLength(MAX_GAUGES)
  })
})

describe('zonaDe', () => {
  const g = (p: Partial<Gauge>): Gauge => ({ src: 'drive', name: 'B1', field: 'current', ...p })
  it('bomba: zonas de Configuración sobre las de fábrica', () => {
    const cfg = { gaugeZones: { B1: { corriente: { min: 0, max: 300, green: 200, yellow: 250 } } } } as unknown as AppConfig
    expect(zonaDe(g({}), cfg, new Map())).toMatchObject({ max: 300, green: 200, yellow: 250 })
    expect(zonaDe(g({}), null, new Map())).toMatchObject({ max: 150, green: 80, yellow: 120 })
  })
  it('lo cargado pisa; alerta > alarma invierte', () => {
    expect(zonaDe(g({ max: 50 }), null, new Map()).max).toBe(50)
    expect(zonaDe(g({ alerta: 30, alarma: 10 }), null, new Map())).toMatchObject({ invert: true, green: 10, yellow: 30 })
    expect(zonaDe(g({ src: 'meter', name: 'M', field: 'pf' }), null, new Map()).bipolar).toBe(true)
    // FP: límites propios ignorados, sigue bipolar (un capacitivo negativo no se sale de escala)
    expect(zonaDe(g({ src: 'meter', name: 'M', field: 'pf', alerta: 0.9, alarma: 0.8 }), null, new Map())).toMatchObject({ bipolar: true, min: 0, max: 1 })
  })
})

describe('lectura', () => {
  const ahora = 1_000_000
  it('bomba: mapea a la propiedad en vivo; offline → null; vieja → stale', () => {
    const drives = new Map([['B1', { name: 'B1', online: true, motorSpeed: 1450, _ts: ahora } as unknown as Drive]])
    expect(lectura({ src: 'drive', name: 'B1', field: 'motor_speed' }, { ...vacio, drives }, ahora)).toEqual({ valor: 1450, stale: false })
    expect(lectura({ src: 'drive', name: 'B1', field: 'motor_speed' }, { ...vacio, drives }, ahora + 60_000).stale).toBe(true)
    expect(lectura({ src: 'drive', name: 'X', field: 'current' }, vacio, ahora).valor).toBeNull()
  })
  it('medidor escala a kW; generador lee mediciones libres x_<slug>', () => {
    const meters = new Map([['M', { name: 'M', online: true, power: 1_500_000, _ts: ahora } as unknown as Meter]])
    expect(lectura({ src: 'meter', name: 'M', field: 'power' }, { ...vacio, meters }, ahora).valor).toBe(1500)
    const pf = (reactive: number) => lectura({ src: 'meter', name: 'M', field: 'pf' },
      { ...vacio, meters: new Map([['M', { name: 'M', online: true, pf: -0.95, reactive, _ts: ahora } as unknown as Meter]]) }, ahora)
    expect(pf(-10)).toEqual({ valor: -0.95, stale: false, sufijo: 'c' })
    expect(pf(10).sufijo).toBe('i')
    expect(pf(0).sufijo).toBeUndefined()
    const campo = new Map([['G', { name: 'G', kind: 'gen', online: true, _ts: ahora, valores: {}, extras: { 'Nivel de combustible': 42 } } as unknown as CampoState]])
    expect(lectura({ src: 'gen', name: 'G', field: 'x_nivel_de_combustible' }, { ...vacio, campo }, ahora).valor).toBe(42)
  })
})
