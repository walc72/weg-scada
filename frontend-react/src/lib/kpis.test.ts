import { describe, it, expect } from 'vitest'
import { calcularKpis, medidorPrincipal } from './kpis'
import type { AppConfig, Drive, FlowmeterState, Meter } from '../types'

const drive = (name: string, p: Partial<Drive> = {}) => ({ name, online: true, running: true, power: 5, ...p }) as Drive
const base = (extra: Partial<Parameters<typeof calcularKpis>[0]> = {}) => ({
  driveList: [drive('B1'), drive('B2')],
  flowmeters: new Map<string, FlowmeterState>(),
  config: { devices: [], flowmeters: [] } as unknown as AppConfig,
  hasCaudales: true,
  hero: null,
  lossData: null,
  ...extra,
})
const de = (r: ReturnType<typeof calcularKpis>, id: string) => r.find(k => k.id === id)

describe('calcularKpis', () => {
  it('sin caudal configurado: caudal y kWh/L en «—» con la aclaración', () => {
    const r = calcularKpis(base())
    const sin = 'Sin caudalímetros ni caudal manual configurado (Configuración → Caudales)'
    expect(de(r, 'caudal')).toMatchObject({ value: '—', unit: 'L/s', title: sin })
    expect(de(r, 'kwhL')).toMatchObject({ value: '—', title: sin })
    expect(de(calcularKpis(base({ hasCaudales: false })), 'caudal')?.title).toBe('Requiere el módulo Caudales')
  })

  it('caudal 36 m³/h y 10 kW de motores → 10,0 L/s y 0,000278 kWh/L', () => {
    const r = calcularKpis(base({
      config: { devices: [], flowmeters: [{ name: 'F1' }] } as unknown as AppConfig,
      flowmeters: new Map([['F1', { name: 'F1', online: true, flow: 36 } as FlowmeterState]]),
    }))
    expect(de(r, 'caudal')?.value).toBe('10,0')
    expect(de(r, 'kwhL')?.value).toBe('0,000278')
    expect(de(r, 'potencia')?.value).toBe('10')
  })

  it('sin lossData no hay pérdida; con lossData, dos ítems de pérdida', () => {
    expect(calcularKpis(base()).some(k => k.id === 'perdida')).toBe(false)
    const r = calcularKpis(base({ lossData: { powerKw: 1.5, energyKwh: 12, mainName: 'P', subLabels: ['A'] } }))
    expect(r.filter(k => k.id === 'perdida').map(k => k.value)).toEqual(['1,5', '12'])
  })

  it('potencia total = suma de las bombas en línea, aunque haya medidor principal', () => {
    const hero = { name: 'PM', online: true, power: 3_006_000, frequency: 50 } as Meter
    const r = calcularKpis(base({ hero, driveList: [drive('B1', { power: 40.5 }), drive('B2', { power: 60 }), drive('B3', { online: false, power: 99 })] }))
    expect(de(r, 'potencia')).toMatchObject({ value: '101', title: 'Suma de la potencia de las bombas en línea' })
  })

  it('motores en marcha excluye fuera de servicio del total', () => {
    const r = calcularKpis(base({ driveList: [drive('B1'), drive('B2', { running: false }), drive('B3', { fueraServicio: true, running: false })] }))
    expect(de(r, 'motores')?.value).toBe('1 / 2')
  })
})

describe('medidorPrincipal', () => {
  const ms = [{ name: 'A', online: false }, { name: 'B', online: true }, { name: 'P', online: false }] as Meter[]
  it('guardado inexistente cae al principal de config, no al primero online', () => {
    expect(medidorPrincipal(ms, null, 'ZZ', 'P')?.name).toBe('P')
  })
  it('sin preferidos válidos: primero online; sin medidores: null', () => {
    expect(medidorPrincipal(ms, 'ZZ')?.name).toBe('B')
    expect(medidorPrincipal([], 'P')).toBeNull()
  })
})
