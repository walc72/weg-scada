import { describe, it, expect } from 'vitest'
import type { DeviceConfig, GatewayConfig } from '../../types'
import { bombasDeSlots, bombasDeUnits, generarSlots, nombreLibre, slotNuevo } from './gateways'

const gw: GatewayConfig = { name: 'PLC', ip: '10.0.0.1', port: 502, site: 'S', kind: 'plc' }
const dev = (p: Partial<DeviceConfig>): DeviceConfig =>
  ({ name: 'x', type: 'SSW900', site: 'S', ip: '', port: 502, unitId: 1, enabled: true, ...p })

describe('gateways', () => {
  it('generarSlots: estados después de los datos', () => {
    const g = generarSlots(gw, 3, true)
    expect(g.scan).toEqual({ regsPerDrive: 70, statusBase: 210, statusStride: 12, maxSlots: 3 })
    expect(g.slots?.[2]).toEqual({ id: 2, regOffset: 140, statusOffset: 234, label: 'SSW 3' })
    expect(gw.slots).toBeUndefined() // puro
  })
  it('generarSlots: base del layout y cantidad acotada', () => {
    const g = generarSlots(gw, 999, false)
    expect(g.slots).toHaveLength(64)
    expect(g.slots?.[1].statusOffset).toBe(152)
  })
  it('slotNuevo sigue al id mayor', () => {
    expect(slotNuevo([])).toEqual({ id: 0, regOffset: 0, statusOffset: 140 })
    expect(slotNuevo([{ id: 4, regOffset: 0, statusOffset: 0 }]).id).toBe(5)
  })
  it('nombreLibre numera repetidos', () => {
    const u = new Set(['A', 'A (2)'])
    expect(nombreLibre(u, 'A')).toBe('A (3)')
    expect(nombreLibre(u, 'B')).toBe('B')
    expect(u.has('A (3)')).toBe(true)
  })
  it('bombasDeSlots: solo slots sin bomba, nombres sin repetir', () => {
    const g = { ...gw, slots: [{ id: 0, regOffset: 0, statusOffset: 0, label: 'P1' }, { id: 1, regOffset: 70, statusOffset: 12 }] }
    const r = bombasDeSlots(g, [dev({ name: 'SSW 2' }), dev({ name: 'Y', gateway: 'PLC', slot: 0 })])
    expect(r.map(d => [d.name, d.slot])).toEqual([['SSW 2 (2)', 1]])
  })
  it('bombasDeUnits: solo Unit IDs nuevos', () => {
    const r = bombasDeUnits({ ...gw, kind: 'adam' }, [1, 2], [dev({ gateway: 'PLC', unitId: 1 })])
    expect(r.map(d => [d.name, d.unitId, d.statusOffset])).toEqual([['SSW 2', 2, 679]])
  })
})
