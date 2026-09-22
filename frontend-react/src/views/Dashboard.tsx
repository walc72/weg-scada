import { useMemo, useState } from 'react'
import { useDrivesStore, selectDriveList, selectMeterList, computeStats, driveHasAnyAlarm, driveAlarmLabel } from '../store/drives'
import { useConfigStore } from '../store/config'
import type { Meter } from '../types'
import Banner from '../components/Banner'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Loader2, TrendingDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDailyEnergy } from '@/lib/useDailyEnergy'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

type Tab = 'drives' | 'medidores'

export default function Dashboard() {
  const drives = useDrivesStore((s) => s.drives)
  const meters = useDrivesStore((s) => s.meters)
  const config = useConfigStore(s => s.config)
  const configReady = config !== null
  const gaugeZones = config?.gaugeZones ?? {}
  const connected = useDrivesStore((s) => s.connected)

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const meterList = useMemo(() => selectMeterList(meters), [meters])
  const stats = useMemo(() => computeStats(drives), [drives])

  // Drives online con falla o alarma activa (panel de alarmas del dashboard)
  const activeAlerts = useMemo(
    () => driveList.filter(d => d.online && (d.hasFault || driveHasAnyAlarm(d))),
    [driveList]
  )
  const anyFault = activeAlerts.some(d => d.hasFault)

  // Energía acumulada del día (kWh) por equipo. Live: /api/reports/daily; mock: estimada.
  const liveEnergy = useDailyEnergy()
  const energyMap = useMemo(() => {
    if (MODE !== 'mock') return liveEnergy
    const m = new Map<string, number>()
    driveList.forEach(d => { if (d.online) m.set(d.name, +((d.power || 0) * 6.2).toFixed(0)) })
    meterList.forEach(mt => { if (mt.online) m.set(mt.name, +(((mt.power || 0) / 1000) * 6.2).toFixed(0)) })
    return m
  }, [liveEnergy, driveList, meterList])

  const [tab, setTab] = useState<Tab>('drives')
  const [heroName, setHeroName] = useState<string | null>(null)

  const cfgMeter = (name: string) => config?.meters?.find(c => c.name === name)
  const displayName = (m: Meter) => cfgMeter(m.name)?.ui?.title || (config as any)?.meterNames?.[m.name] || m.name

  // Balance / pérdida: principal − Σ seleccionados (potencia en vivo + energía hoy)
  const loss = config?.lossMeter
  const lossData = useMemo(() => {
    if (!loss?.main) return null
    const byName = new Map(meterList.map(m => [m.name, m]))
    const main = byName.get(loss.main)
    if (!main) return null
    const subNames = loss.subtract || []
    const subPowerW = subNames.reduce((s, n) => s + ((byName.get(n)?.power) || 0), 0)
    const powerKw = ((main.power || 0) - subPowerW) / 1000
    const energyKwh = (energyMap.get(loss.main) ?? 0) - subNames.reduce((s, n) => s + (energyMap.get(n) ?? 0), 0)
    return { powerKw, energyKwh, mainName: displayName(main), subLabels: subNames.map(n => { const m = byName.get(n); return m ? displayName(m) : n }) }
  }, [loss, meterList, energyMap])

  // Medidor principal: el elegido, si no el primero online, si no el primero
  const hero = useMemo(() => {
    if (heroName) { const h = meterList.find(m => m.name === heroName); if (h) return h }
    return meterList.find(m => m.online) ?? meterList[0] ?? null
  }, [heroName, meterList])

  const otherMeters = meterList.filter(m => !hero || m.name !== hero.name)

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'drives', label: 'Drives (CFW / SSW)', count: driveList.length },
    { key: 'medidores', label: 'Medidores', count: meterList.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Banner stats={stats} connected={connected} />

      {/* Panel de alarmas activas (falla o alarma por drive) */}
      {activeAlerts.length > 0 && (
        <Card className="p-4 border-l-4" style={{ borderLeftColor: anyFault ? '#ef4444' : '#f59e0b' }}>
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle className="h-5 w-5" style={{ color: anyFault ? '#ef4444' : '#f59e0b' }} />
            <span className="font-bold text-base">Alarmas activas</span>
            <span className="text-xs text-muted-foreground">({activeAlerts.length})</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {activeAlerts.map(d => (
              <div key={d.name} className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-medium min-w-[7rem]">{d.displayName || d.name}</span>
                <span className="text-[11px] text-muted-foreground">{d.type}</span>
                {d.hasFault && <Badge variant="destructive" className="text-[10px] py-0">FALLA: {d.faultText}</Badge>}
                {driveHasAnyAlarm(d) && <Badge variant="warning" className="text-[10px] py-0">ALARMA: {driveAlarmLabel(d) || 'activa'}</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Medidor principal (siempre arriba) + selector */}
      {meterList.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground uppercase tracking-wide mr-1">Medidor principal</span>
            {meterList.map(m => (
              <button
                key={m.name}
                onClick={() => setHeroName(m.name)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors',
                  hero?.name === m.name
                    ? 'bg-primary/15 border-primary/40 text-foreground'
                    : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', m.online ? 'bg-green-500' : 'bg-muted-foreground')} />
                {displayName(m)}
              </button>
            ))}
          </div>
          {hero && (
            <PM8000Card m={hero} zones={cfgMeter(hero.name)?.ui?.zones} meterName={displayName(hero)} energyKwh={energyMap.get(hero.name)} hero />
          )}
        </div>
      )}

      {/* Pérdida / balance */}
      {lossData && (
        <Card className="p-4 border-l-4" style={{ borderLeftColor: '#E87722' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              <span className="font-bold text-base">Pérdida (balance de líneas)</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Potencia</div>
                <div className="text-2xl font-semibold tabular-nums leading-tight">{lossData.powerKw.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kW</span></div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Energía hoy</div>
                <div className="text-2xl font-semibold tabular-nums leading-tight">{lossData.energyKwh.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">kWh</span></div>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {lossData.mainName} − ({lossData.subLabels.length ? lossData.subLabels.join(' + ') : 'nada'})
          </div>
        </Card>
      )}

      {/* Pestañas Drives / Medidores */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full', tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Contenido de la pestaña */}
      {tab === 'drives' ? (
        driveList.length > 0 && configReady ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-fr">
            {driveList.map((d) => <DriveCard key={d.name} d={d} gaugeZones={gaugeZones} energyKwh={energyMap.get(d.name)} />)}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-16">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
            Esperando datos de drives...
          </div>
        )
      ) : (
        otherMeters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {otherMeters.map((m) => <PM8000Card key={m.name} m={m} zones={cfgMeter(m.name)?.ui?.zones} meterName={displayName(m)} energyKwh={energyMap.get(m.name)} />)}
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-10">No hay otros medidores configurados.</div>
        )
      )}
    </div>
  )
}
