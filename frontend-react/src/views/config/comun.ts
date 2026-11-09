import type { DriveType } from '../../types'

export const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
export const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

export function gaugeListFor(type: DriveType) {
  const list: Array<{ key: string; label: string; unit: string }> = []
  if (type === 'CFW900') list.push({ key: 'velocidad', label: 'Velocidad', unit: 'RPM' })
  list.push({ key: 'corriente', label: 'Corriente', unit: 'A' })
  list.push({ key: 'tension', label: 'Tensión', unit: 'V' })
  if (type === 'CFW900') list.push({ key: 'frecuencia', label: 'Frecuencia', unit: 'Hz' })
  return list
}
