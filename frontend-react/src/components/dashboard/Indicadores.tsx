import { useMemo } from 'react'
import { useDrivesStore } from '../../store/drives'
import { useConfigStore } from '../../store/config'
import { useLicense } from '../../store/license'
import type { Meter } from '../../types'
import { calcularKpis } from '@/lib/kpis'
import { useDatosDashboard, type GadgetProps } from './GadgetMarco'

// Medidor de referencia de los KPIs: el principal configurado; si no, el primero online; si no, el primero
export const medidorPrincipal = (meters: Meter[], primary?: string | null) =>
  (primary ? meters.find(m => m.name === primary) : undefined) ?? meters.find(m => m.online) ?? meters[0] ?? null

export default function Indicadores({ opciones }: GadgetProps<{ ocultos: string[] }>) {
  const { driveList, meterList, daily } = useDatosDashboard()
  const config = useConfigStore(s => s.config)
  const flowmeters = useDrivesStore(s => s.flowmeters)
  const hasCaudales = useLicense(s => s.hasModule('caudales'))
  const energyOf = (name: string) => daily.get(name)?.energyKwh

  // Balance / pérdida: principal − Σ seleccionados (potencia en vivo + energía hoy)
  const loss = config?.lossMeter
  const lossData = useMemo(() => {
    if (!loss?.main) return null
    const byName = new Map(meterList.map(m => [m.name, m]))
    const main = byName.get(loss.main)
    if (!main) return null
    const displayName = (m: Meter) => config?.meters?.find(c => c.name === m.name)?.ui?.title || (config as any)?.meterNames?.[m.name] || m.name
    const subNames = loss.subtract || []
    const subPowerW = subNames.reduce((s, n) => s + ((byName.get(n)?.power) || 0), 0)
    const energy = (n: string) => daily.get(n)?.energyKwh
    return {
      powerKw: ((main.power || 0) - subPowerW) / 1000,
      energyKwh: (energy(loss.main) ?? 0) - subNames.reduce((s, n) => s + (energy(n) ?? 0), 0),
      mainName: displayName(main),
      subLabels: subNames.map(n => { const m = byName.get(n); return m ? displayName(m) : n }),
    }
  }, [loss, meterList, daily, config])

  const hero = medidorPrincipal(meterList, config?.primaryMeter)
  const kpis = calcularKpis({ driveList, flowmeters, config, hasCaudales, hero, energiaHero: hero ? energyOf(hero.name) : undefined, lossData })
    .filter(k => !opciones.ocultos.includes(k.id))
  if (kpis.length === 0) return null

  return (
    <section aria-label="Indicadores de planta" className="grid gap-px border bg-border" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {kpis.map(k => (
        <div key={k.label} className="bg-card px-3.5 py-2.5 flex flex-col justify-between gap-0.5" title={k.title}>
          <span className="text-[11px] text-muted-foreground tracking-widest">{k.label}</span>
          <span className="font-mono text-2xl font-medium tabular-nums">{k.value} <span className="text-[13px] text-muted-foreground">{k.unit}</span></span>
        </div>
      ))}
    </section>
  )
}
