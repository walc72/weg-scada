// Indicadores de planta del Dashboard (puro): potencia = suma de las bombas; energía/frecuencia del medidor principal,
// caudal de los caudalímetros (+ bombas con caudal manual) y pérdida por balance de líneas.
import type { AppConfig, Drive, FlowmeterState, Meter } from '../types'
import { aLps, UNIDAD_CAUDAL } from './flow'
import type { KPI_IDS } from './gadgets'

export type Kpi = { id: typeof KPI_IDS[number]; label: string; value: string; unit: string; title?: string }
export type LossData = { powerKw: number; energyKwh: number; mainName: string; subLabels: string[] }

// Primer medidor que exista de los preferidos (en orden); si ninguno, el primero online; si no, el primero
export const medidorPrincipal = (meters: Meter[], ...preferidos: (string | null | undefined)[]) =>
  preferidos.reduce<Meter | undefined>((h, n) => h ?? (n ? meters.find(m => m.name === n) : undefined), undefined)
    ?? meters.find(m => m.online) ?? meters[0] ?? null

// Nombre visible de un medidor: título de su ficha, nombre configurado o nombre interno
export const nombreMedidor = (config: AppConfig | null, name: string): string =>
  config?.meters?.find(c => c.name === name)?.ui?.title || (config as any)?.meterNames?.[name] || name

export function calcularKpis({ driveList, flowmeters, config, hasCaudales, hero, energiaHero, lossData }: {
  driveList: Drive[]
  flowmeters: Map<string, FlowmeterState>
  config: AppConfig | null
  hasCaudales: boolean
  hero: Meter | null
  energiaHero?: number
  lossData: LossData | null
}): Kpi[] {
  const drivesKw = driveList.reduce((t, d) => t + (d.online ? d.power || 0 : 0), 0)
  // Caudal: caudalímetros en línea + bombas con caudal manual (no se pisan: una bomba es manual o tiene caudalímetro)
  const manuales = new Set((config?.devices ?? []).filter(x => x.caudal?.modo === 'manual').map(x => x.name))
  const conCaudal = hasCaudales && ((config?.flowmeters?.length ?? 0) > 0 || manuales.size > 0)
  const flow = !conCaudal ? 0
    : [...flowmeters.values()].reduce((t, f) => t + (f.online && f.flow != null ? f.flow : 0), 0)
      + driveList.reduce((t, d) => t + (manuales.has(d.name) && d.online && d.flow != null ? d.flow : 0), 0)
  const n = (v: number, d = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
  const out: Kpi[] = [
    { id: 'motores', label: 'MOTORES EN MARCHA', value: `${driveList.filter(d => d.online && d.running).length} / ${driveList.filter(d => !d.fueraServicio).length}`, unit: '' },
    // Suma de las bombas en línea (no el medidor principal, que incluye otras cargas y pérdidas)
    { id: 'potencia', label: 'POTENCIA TOTAL', value: n(drivesKw), unit: 'kW', title: 'Suma de la potencia de las bombas en línea' },
  ]
  // Siempre visibles: sin caudal configurado quedan en "—" con la aclaración en el tooltip
  const sinCaudal = !hasCaudales ? 'Requiere el módulo Caudales' : 'Sin caudalímetros ni caudal manual configurado (Configuración → Caudales)'
  out.push({ id: 'caudal', label: 'CAUDAL TOTAL', value: conCaudal ? n(aLps(flow), 1) : '—', unit: UNIDAD_CAUDAL, title: conCaudal ? undefined : sinCaudal })
  if (typeof energiaHero === 'number') out.push({ id: 'energia', label: 'ENERGÍA HOY', value: n(energiaHero), unit: 'kWh' })
  out.push({ id: 'kwhL', label: 'kWh / L', value: conCaudal && flow > 0 ? n(drivesKw / flow / 1000, 6) : '—', unit: '', title: conCaudal ? 'Energía por litro bombeado: potencia de los motores ÷ caudal total' : sinCaudal })
  if (hero?.online && hero.frequency) out.push({ id: 'frecuencia', label: 'FRECUENCIA RED', value: n(hero.frequency, 2), unit: 'Hz' })
  // Pérdida (balance de líneas): principal − Σ seleccionados
  if (lossData) {
    const f = `${lossData.mainName} − (${lossData.subLabels.join(' + ') || 'nada'})`
    out.push({ id: 'perdida', label: 'PÉRDIDA DE POTENCIA', value: n(lossData.powerKw, 1), unit: 'kW', title: f })
    out.push({ id: 'perdida', label: 'PÉRDIDA DE ENERGÍA HOY', value: n(lossData.energyKwh), unit: 'kWh', title: f })
  }
  return out
}
