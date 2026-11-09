// Lógica pura de la pestaña Gateways (testeable sin React).
import type { DeviceConfig, GatewayConfig, GatewayScanCfg, GatewaySlot } from '../../types'
import { DEFAULT_GATEWAY_SCAN } from '../../types'

export const scanDe = (gw: GatewayConfig): GatewayScanCfg => ({ ...DEFAULT_GATEWAY_SCAN, ...(gw.scan || {}) })

// Cantidad de bombas del generador acotada a 1..64
export const cantidadGen = (n: number) => Math.max(1, Math.min(64, Math.floor(n) || 1))

// Mapa de N slots según el layout. `despues`: los estados arrancan tras toda la zona de
// datos (statusBase = N × regsPerDrive) para que datos y estados no se solapen.
export function generarSlots(gw: GatewayConfig, cantidad: number, despues: boolean): GatewayConfig {
  const n = cantidadGen(cantidad)
  const sc = scanDe(gw)
  const statusBase = despues ? n * sc.regsPerDrive : sc.statusBase
  const slots: GatewaySlot[] = Array.from({ length: n }, (_, i) => ({
    id: i, regOffset: i * sc.regsPerDrive, statusOffset: statusBase + i * sc.statusStride, label: `SSW ${i + 1}`,
  }))
  return { ...gw, scan: { ...sc, statusBase, maxSlots: n }, slots }
}

export function slotNuevo(slots: GatewaySlot[]): GatewaySlot {
  const id = slots.length ? Math.max(...slots.map(s => s.id)) + 1 : 0
  return { id, regOffset: id * 70, statusOffset: 140 + id * 12 }
}

// Nombre libre: «base», «base (2)», «base (3)»…; lo reserva en `usados`.
export function nombreLibre(usados: Set<string>, base: string) {
  let name = base
  if (usados.has(name)) { let k = 2; while (usados.has(`${base} (${k})`)) k++; name = `${base} (${k})` }
  usados.add(name)
  return name
}

// SSW900 por cada slot del gateway PLC que todavía no tiene bomba
export function bombasDeSlots(gw: GatewayConfig, devices: DeviceConfig[]): DeviceConfig[] {
  const usadosSlot = new Set(devices.filter(d => d.gateway === gw.name).map(d => d.slot))
  const nombres = new Set(devices.map(d => d.name))
  return (gw.slots ?? []).filter(s => !usadosSlot.has(s.id)).map((s): DeviceConfig => ({
    name: nombreLibre(nombres, (s.label && s.label.trim()) || `SSW ${s.id + 1}`),
    type: 'SSW900', site: gw.site || 'Agriplus', ip: gw.ip, port: gw.port, unitId: 1, enabled: true, gateway: gw.name, slot: s.id,
  }))
}

// SSW900 por cada Unit ID detectado en el ADAM que todavía no tiene bomba
export function bombasDeUnits(gw: GatewayConfig, units: number[], devices: DeviceConfig[]): DeviceConfig[] {
  const usadosUnit = new Set(devices.filter(d => d.gateway === gw.name).map(d => d.unitId))
  const nombres = new Set(devices.map(d => d.name))
  return units.filter(u => !usadosUnit.has(u)).map((u): DeviceConfig => ({
    name: nombreLibre(nombres, `SSW ${u}`),
    type: 'SSW900', site: gw.site || 'Agrocaraya', ip: gw.ip, port: gw.port, unitId: u, enabled: true, gateway: gw.name, statusOffset: 679,
  }))
}
