import type { AppConfig, FlowmeterConfig } from '../types'

// El caudal se guarda en m³/h (poller, Influx, config.json, MQTT) y se muestra
// y se pide en L/s: la conversión va solo en los bordes de presentación/entrada
export const UNIDAD_CAUDAL = 'L/s'
export const aLps = (m3h: number) => m3h / 3.6
export const desdeLps = (lps: number) => lps * 3.6
export const aLpsN = (m3h: number | null | undefined) => (m3h == null ? m3h : aLps(m3h))
// El volumen se guarda en m³ y se muestra en litros
export const aLitros = (m3: number | null | undefined) => (m3 == null ? m3 : Math.round(m3 * 1000))

// Caudal (dato en m³/h) como texto en L/s con 1 decimal, sin la unidad
export function fmtFlow(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return aLps(v).toFixed(1)
}

// Caudalímetro (habilitado o no) que incluye a la bomba
export function flowmeterOf(cfg: AppConfig | null | undefined, pump: string): FlowmeterConfig | undefined {
  return (cfg?.flowmeters || []).find(f => (f.bombas || []).includes(pump))
}

export const SOURCE_LABEL: Record<string, string> = { estimado: 'Estimado', totalizador: 'Totalizador', integrado: 'Integrado' }

// "Colector <nombre>", sin repetir si el nombre ya empieza con "Colector"
export const colectorLabel = (name: string) => (/^colector\b/i.test(name) ? name : `Colector ${name}`)
