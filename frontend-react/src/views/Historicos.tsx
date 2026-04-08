import { useMemo, useState } from 'react'
import { useDrivesStore, selectDriveList } from '../store/drives'
import TrendChart, { SeriesDef } from '../components/TrendChart'
import TimeRangePicker, { TimeRange } from '../components/TimeRangePicker'
import { LineChart, Wifi, WifiOff, Play, Square, AlertTriangle, Power, Zap } from 'lucide-react'
import { Card } from '../components/ui/card'
import { cn } from '@/lib/utils'
import type { HistoryPoint } from '../store/drives'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

// Merge per-drive histories by array index (drives update in sync)
function buildDriveData(
  driveNames: string[],
  histories: Map<string, HistoryPoint[]>,
  field: keyof HistoryPoint,
  since: number,
  until = Infinity
): Record<string, number | string>[] {
  const arrays = driveNames.map(n => {
    const arr = histories.get(n) ?? []
    return arr.filter(p => (since === 0 || p.ts >= since) && p.ts <= until)
  })
  const maxLen = Math.max(...arrays.map(a => a.length), 0)
  return Array.from({ length: maxLen }, (_, i) => {
    const tick: Record<string, number> = { ts: 0 }
    for (let j = 0; j < driveNames.length; j++) {
      if (i < arrays[j].length) {
        tick.ts = arrays[j][i].ts
        tick[driveNames[j]] = arrays[j][i][field] as number
      }
    }
    return tick
  })
}

export default function Historicos() {
  const drives = useDrivesStore(s => s.drives)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const meterHistory = useDrivesStore(s => s.meterHistory)

  const connected = useDrivesStore(s => s.connected)
  const [timeRange, setTimeRange] = useState<TimeRange>({ windowMs: 30 * 60_000, endOffset: 0 })
  const now = Date.now()
  const since = timeRange.windowMs === 0
    ? (timeRange.fixedStart ?? 0)
    : timeRange.windowMs > 0 ? now + timeRange.endOffset - timeRange.windowMs : 0
  const until = timeRange.windowMs === 0
    ? (timeRange.fixedEnd ?? Infinity)
    : timeRange.endOffset === 0 ? Infinity : now + timeRange.endOffset

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const cfwList = useMemo(() => driveList.filter(d => d.type === 'CFW900'), [driveList])
  const sswList = useMemo(() => driveList.filter(d => d.type === 'SSW900'), [driveList])

  const statsOnline  = driveList.filter(d => d.online && !d.hasFault).length
  const statsOffline = driveList.filter(d => !d.online).length
  const statsRunning = driveList.filter(d => d.running).length
  const statsStop    = driveList.filter(d => d.online && !d.running && !d.hasFault).length
  const statsFault   = driveList.filter(d => d.hasFault).length
  const totalCurrent = driveList.reduce((s, d) => s + (d.current || 0), 0)
  const totalPower   = driveList.reduce((s, d) => s + (d.power || 0), 0)

  const allNames = driveList.map(d => d.name)
  const cfwNames = cfwList.map(d => d.name)
  const sswNames = sswList.map(d => d.name)

  const driveSeries: SeriesDef[] = driveList.map((d, i) => ({
    key: d.name,
    label: d.displayName ?? d.name,
    color: COLORS[i % COLORS.length]
  }))
  const cfwSeries: SeriesDef[] = cfwList.map((d, i) => ({
    key: d.name,
    label: d.displayName ?? d.name,
    color: COLORS[i % COLORS.length]
  }))
  const sswSeries: SeriesDef[] = sswList.map((d, i) => ({
    key: d.name,
    label: d.displayName ?? d.name,
    color: COLORS[(cfwList.length + i) % COLORS.length]
  }))

  // PM8000 series
  const meterCurrentSeries: SeriesDef[] = [{ key: 'current', label: 'Corriente', color: '#3b82f6' }]
  const meterPowerSeries: SeriesDef[] = [{ key: 'power', label: 'Potencia', color: '#22c55e' }]
  const meterPfSeries: SeriesDef[] = [{ key: 'pf', label: 'Factor de Potencia', color: '#f59e0b' }]

  const currentData = useMemo(
    () => buildDriveData(allNames, driveHistory, 'current', since, until),
    [driveHistory, allNames.join(), since, until]
  )
  const powerData = useMemo(
    () => buildDriveData(allNames, driveHistory, 'power', since, until),
    [driveHistory, allNames.join(), since, until]
  )
  const speedData = useMemo(
    () => buildDriveData(cfwNames, driveHistory, 'speed', since),
    [driveHistory, cfwNames.join(), since]
  )
  const freqData = useMemo(
    () => buildDriveData(cfwNames, driveHistory, 'frequency', since),
    [driveHistory, cfwNames.join(), since]
  )
  const voltageData = useMemo(
    () => buildDriveData(allNames, driveHistory, 'voltage', since, until),
    [driveHistory, allNames.join(), since, until]
  )
  const igbtData = useMemo(
    () => buildDriveData(cfwNames, driveHistory, 'igbtTemp', since),
    [driveHistory, cfwNames.join(), since]
  )
  const scrData = useMemo(
    () => buildDriveData(sswNames, driveHistory, 'scrTemp', since),
    [driveHistory, sswNames.join(), since]
  )
  const cosPhiData = useMemo(
    () => buildDriveData(allNames, driveHistory, 'cosPhi', since, until),
    [driveHistory, allNames.join(), since, until]
  )
  const filteredMeterHistory = useMemo(
    () => (meterHistory.get('PM8000') ?? []).filter(p => (since === 0 || p.ts >= since) && p.ts <= until),
    [meterHistory, since, until]
  )

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <LineChart className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Históricos</h2>

        <TimeRangePicker value={timeRange} onChange={setTimeRange} />

        <div className="ml-auto">
          {connected
            ? <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400"><Wifi className="h-3.5 w-3.5" />CONECTADO</span>
            : <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><WifiOff className="h-3.5 w-3.5" />SIN CONEXIÓN</span>
          }
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: 'Online',    value: statsOnline,  icon: Wifi,          color: 'text-green-500',  bg: 'bg-green-500/10' },
          { label: 'Offline',   value: statsOffline, icon: WifiOff,       color: 'text-slate-400',  bg: 'bg-slate-400/10' },
          { label: 'En Marcha', value: statsRunning, icon: Play,          color: 'text-blue-500',   bg: 'bg-blue-500/10'  },
          { label: 'Detenido',  value: statsStop,    icon: Square,        color: 'text-yellow-500', bg: 'bg-yellow-500/10'},
          { label: 'Falla',     value: statsFault,   icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-500/10'   },
          { label: 'I Total',   value: `${totalCurrent.toFixed(1)} A`, icon: Power, color: 'text-cyan-500',   bg: 'bg-cyan-500/10'  },
          { label: 'P Total',   value: `${totalPower.toFixed(2)} kW`,  icon: Zap,   color: 'text-purple-500', bg: 'bg-purple-500/10'},
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className={cn('flex items-center gap-3 px-4 py-3', bg)}>
            <Icon className={cn('h-5 w-5 shrink-0', color)} />
            <div>
              <div className={cn('text-lg font-bold leading-tight', color)}>{value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Corriente ───────────────────────────────── */}
      <TrendChart
        title="Corriente por Drive (A)"
        data={currentData}
        series={driveSeries}
        unit="A"
        height={200}
        yDomain={['auto', 'auto']}
      />

      {/* ── Potencia + Tensión de Salida ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TrendChart
          title="Potencia por Drive (kW)"
          data={powerData}
          series={driveSeries}
          unit="kW"
          height={200}
          yDomain={['auto', 'auto']}
        />
        <TrendChart
          title="Tensión de Salida (V)"
          data={voltageData}
          series={driveSeries}
          unit="V"
          height={200}
          yDomain={['auto', 'auto']}
        />
      </div>

      {/* ── Velocidad + Frecuencia (CFW) ──────────────── */}
      {cfwList.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TrendChart
            title="Velocidad Motor — CFW900 (RPM)"
            data={speedData}
            series={cfwSeries}
            unit="RPM"
            height={200}
            yDomain={['auto', 'auto']}
          />
          <TrendChart
            title="Frecuencia de Salida — CFW900 (Hz)"
            data={freqData}
            series={cfwSeries}
            unit="Hz"
            height={200}
            yDomain={['auto', 'auto']}
          />
        </div>
      )}

      {/* ── Temperaturas ─────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {cfwList.length > 0 && (
          <TrendChart
            title="Temperatura IGBT — CFW900 (°C)"
            data={igbtData}
            series={cfwSeries}
            unit="°C"
            height={200}
          />
        )}
        {sswList.length > 0 && (
          <TrendChart
            title="Temperatura SCR — SSW900 (°C)"
            data={scrData}
            series={sswSeries}
            unit="°C"
            height={200}
          />
        )}
      </div>

      {/* ── Factor de Potencia ───────────────────────── */}
      <TrendChart
        title="Factor de Potencia (Cos φ)"
        data={cosPhiData}
        series={driveSeries}
        unit=""
        height={180}
        yDomain={[0, 1]}
      />

      {/* ── PM8000 ───────────────────────────────────── */}
      {filteredMeterHistory.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2 border-t">
            <span className="text-sm font-semibold text-muted-foreground">Medición Línea Exclusiva (PM8000)</span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <TrendChart
              title="Corriente (A)"
              data={filteredMeterHistory}
              series={meterCurrentSeries}
              unit="A"
              height={180}
              yDomain={['auto', 'auto']}
            />
            <TrendChart
              title="Potencia (kW)"
              data={filteredMeterHistory}
              series={meterPowerSeries}
              unit="kW"
              height={180}
              yDomain={['auto', 'auto']}
            />
            <TrendChart
              title="Factor de Potencia"
              data={filteredMeterHistory}
              series={meterPfSeries}
              unit=""
              height={180}
              yDomain={[0, 1]}
            />
          </div>
        </>
      )}
    </div>
  )
}
