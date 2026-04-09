import { useMemo, useState, useEffect } from 'react'
import { useDrivesStore, selectDriveList, selectMeterList, computeStats } from '../store/drives'
import { useConfigStore } from '../store/config'
import Banner from '../components/Banner'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import { Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function loadGaugeZones() {
  try { return JSON.parse(localStorage.getItem('scada_gauge_zones') ?? '{}') } catch { return {} }
}

export default function Dashboard() {
  const drives = useDrivesStore((s) => s.drives)
  const meters = useDrivesStore((s) => s.meters)
  const configReady = useConfigStore(s => s.config !== null)
  const [gaugeZones, setGaugeZones] = useState(loadGaugeZones)
  useEffect(() => {
    const handler = () => setGaugeZones(loadGaugeZones())
    window.addEventListener('gaugeZonesUpdated', handler)
    return () => window.removeEventListener('gaugeZonesUpdated', handler)
  }, [])
  const connected = useDrivesStore((s) => s.connected)

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const meterList = useMemo(() => selectMeterList(meters), [meters])
  const stats = useMemo(() => computeStats(drives), [drives])
  const [metersOpen, setMetersOpen] = useState(true)

  return (
    <div className="flex flex-col gap-4">
      <Banner stats={stats} connected={connected} />

      {meterList.slice(0, 1).map((m) => <PM8000Card key={m.name} m={m} />)}

      {meterList.length > 1 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setMetersOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-semibold"
          >
            <span>Otros medidores ({meterList.length - 1})</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', metersOpen && 'rotate-180')} />
          </button>
          {metersOpen && (
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {meterList.slice(1).map((m) => <PM8000Card key={m.name} m={m} />)}
            </div>
          )}
        </div>
      )}

      {driveList.length > 0 && configReady ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
          {driveList.map((d) => <DriveCard key={d.name} d={d} gaugeZones={gaugeZones} />)}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-16">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
          Esperando datos de drives...
        </div>
      )}
    </div>
  )
}
