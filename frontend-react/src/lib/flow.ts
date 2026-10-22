import type { AppConfig, FlowmeterConfig } from '../types'

// Caudal en m³/h: sin decimales desde 100, uno debajo
export function fmtFlow(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(Math.abs(v) >= 100 ? 0 : 1)
}

// Caudalímetro (habilitado o no) que incluye a la bomba
export function flowmeterOf(cfg: AppConfig | null | undefined, pump: string): FlowmeterConfig | undefined {
  return (cfg?.flowmeters || []).find(f => (f.bombas || []).includes(pump))
}

export const SOURCE_LABEL: Record<string, string> = { estimado: 'Estimado', totalizador: 'Totalizador', integrado: 'Integrado' }

// "Colector <nombre>", sin repetir si el nombre ya empieza con "Colector"
export const colectorLabel = (name: string) => (/^colector\b/i.test(name) ? name : `Colector ${name}`)
