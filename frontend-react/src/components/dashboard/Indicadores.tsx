import { useCallback, useMemo } from 'react'
import { useDrivesStore } from '../../store/drives'
import { useConfigStore } from '../../store/config'
import { useLicense } from '../../store/license'
import { calcularKpis, medidorPrincipal, nombreMedidor } from '@/lib/kpis'
import { useDatosDashboard, type GadgetProps } from './GadgetMarco'

export default function Indicadores({ opciones }: GadgetProps<{ ocultos: string[] }>) {
  const { driveList, meterList, daily } = useDatosDashboard()
  const config = useConfigStore(s => s.config)
  const flowmeters = useDrivesStore(s => s.flowmeters)
  const listo = useDrivesStore(s => s.listo)
  const hasCaudales = useLicense(s => s.hasModule('caudales'))

  const energyOf = useCallback((name: string) => daily.get(name)?.energyKwh, [daily])

  // Balance / pérdida: principal − Σ seleccionados (potencia en vivo + energía hoy)
  const loss = config?.lossMeter
  const lossData = useMemo(() => {
    if (!loss?.main) return null
    const byName = new Map(meterList.map(m => [m.name, m]))
    const main = byName.get(loss.main)
    if (!main) return null
    const subNames = loss.subtract || []
    const subPowerW = subNames.reduce((s, n) => s + ((byName.get(n)?.power) || 0), 0)
    return {
      powerKw: ((main.power || 0) - subPowerW) / 1000,
      energyKwh: (energyOf(loss.main) ?? 0) - subNames.reduce((s, n) => s + (energyOf(n) ?? 0), 0),
      mainName: nombreMedidor(config, main.name),
      subLabels: subNames.map(n => (byName.has(n) ? nombreMedidor(config, n) : n)),
    }
  }, [loss, meterList, energyOf, config])

  // Medidor de referencia de los KPIs: el principal configurado (→ primero online → primero)
  const hero = medidorPrincipal(meterList, config?.primaryMeter)
  const kpis = calcularKpis({ driveList, flowmeters, config, hasCaudales, hero, energiaHero: hero ? energyOf(hero.name) : undefined, lossData })
    .filter(k => !opciones.ocultos.includes(k.id))
  if (kpis.length === 0) return null

  return (
    <section aria-label="Indicadores de planta" className="grid gap-px border bg-border" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {kpis.map(k => (
        <div key={k.label} className="bg-card px-3 py-1.5 flex flex-col justify-between gap-0.5" title={k.title}>
          <span className="text-[11px] text-muted-foreground tracking-widest">{k.label}</span>
          <span className="font-mono text-2xl font-medium tabular-nums">{listo ? k.value : '—'} <span className="text-[13px] text-muted-foreground">{k.unit}</span></span>
        </div>
      ))}
    </section>
  )
}
