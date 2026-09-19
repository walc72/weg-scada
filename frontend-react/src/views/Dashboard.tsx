import { useMemo, useState } from 'react'
import { useDrivesStore, selectDriveList, selectMeterList, computeStats } from '../store/drives'
import { useConfigStore } from '../store/config'
import type { Meter } from '../types'
import Banner from '../components/Banner'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  const [tab, setTab] = useState<Tab>('drives')
  const [heroName, setHeroName] = useState<string | null>(null)

  const cfgMeter = (name: string) => config?.meters?.find(c => c.name === name)
  const displayName = (m: Meter) => cfgMeter(m.name)?.ui?.title || (config as any)?.meterNames?.[m.name] || m.name

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
            <PM8000Card m={hero} zones={cfgMeter(hero.name)?.ui?.zones} meterName={displayName(hero)} hero />
          )}
        </div>
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
            {driveList.map((d) => <DriveCard key={d.name} d={d} gaugeZones={gaugeZones} />)}
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
            {otherMeters.map((m) => <PM8000Card key={m.name} m={m} zones={cfgMeter(m.name)?.ui?.zones} meterName={displayName(m)} />)}
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-10">No hay otros medidores configurados.</div>
        )
      )}
    </div>
  )
}
