import { useMemo, useState, useEffect, useCallback } from 'react'
import { useDrivesStore, selectDriveList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import type { MeterPoint } from '../store/drives'
import TrendChart, { SeriesDef } from '../components/TrendChart'
import TimeRangePicker, { TimeRange } from '../components/TimeRangePicker'
import { LineChart, Wifi, WifiOff, Play, Square, AlertTriangle, Power, Zap, Timer, Database, Loader2, ChevronDown } from 'lucide-react'
import { Card } from '../components/ui/card'
import { cn } from '@/lib/utils'
import { mergeByTimestamp } from '@/lib/timeline'
import type { HistoryPoint } from '../store/drives'

const DATA_MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

// Fila pivoteada que devuelve /api/reports/series (una por _time + name)
type SeriesRow = { _time: string; name: string; [k: string]: number | string }

// Convierte filas de InfluxDB en datos para TrendChart: [{ ts, [name]: value }].
// `scale` para pasar W→kW, V→kV, etc.
function rowsToChart(rows: SeriesRow[], field: string, scale = 1): Record<string, number>[] {
  const byTs = new Map<number, Record<string, number>>()
  for (const r of rows || []) {
    const t = new Date(r._time).getTime()
    let o = byTs.get(t)
    if (!o) { o = { ts: t }; byTs.set(t, o) }
    const v = r[field]
    if (typeof v === 'number' && !isNaN(v)) o[r.name] = scale === 1 ? v : v * scale
  }
  return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts)
}

const REFRESH_OPTIONS = [
  { label: '1s',  ms: 1000 },
  { label: '2s',  ms: 2000 },
  { label: '5s',  ms: 5000 },
  { label: '10s', ms: 10000 },
  { label: '30s', ms: 30000 },
]

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

// Merge de historiales por cercania de timestamp (antes se alineaba por
// indice de array, lo que corria las series en el tiempo si un drive
// reconectaba tarde y su buffer era mas corto)
function buildDriveData(
  driveNames: string[],
  histories: Map<string, HistoryPoint[]>,
  field: keyof HistoryPoint,
  since: number,
  until = Infinity
): Record<string, number | string>[] {
  const series: Record<string, HistoryPoint[]> = {}
  for (const n of driveNames) {
    series[n] = (histories.get(n) ?? [])
      .filter(p => (since === 0 || p.ts >= since) && p.ts <= until)
  }
  return mergeByTimestamp(series).map(({ ts, points }) => {
    const tick: Record<string, number> = { ts }
    for (const n of driveNames) {
      const p = points[n]
      if (p) tick[n] = p[field] as number
    }
    return tick
  })
}

export default function Historicos() {
  const drives = useDrivesStore(s => s.drives)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const meterHistory = useDrivesStore(s => s.meterHistory)

  const connected = useDrivesStore(s => s.connected)
  const refreshMs = useDrivesStore(s => s.refreshMs)
  const setRefreshMs = useDrivesStore(s => s.setRefreshMs)
  const [showRefresh, setShowRefresh] = useState(false)
  const [chartTab, setChartTab] = useState<'drives' | 'medidores' | 'perdida' | 'potencias'>('drives')
  const [bucket, setBucket] = useState('weg_drives')
  const [buckets, setBuckets] = useState<string[]>([])
  const [collapsedMeters, setCollapsedMeters] = useState<Record<string, boolean>>({})
  const currentLabel = REFRESH_OPTIONS.find(o => o.ms === refreshMs)?.label ?? `${refreshMs / 1000}s`
  const [timeRange, setTimeRange] = useState<TimeRange>({ windowMs: 30 * 60_000, endOffset: 0 })
  const now = Date.now()
  const since = timeRange.windowMs === 0
    ? (timeRange.fixedStart ?? 0)
    : timeRange.windowMs > 0 ? now + timeRange.endOffset - timeRange.windowMs : 0
  const until = timeRange.windowMs === 0
    ? (timeRange.fixedEnd ?? Infinity)
    : timeRange.endOffset === 0 ? Infinity : now + timeRange.endOffset

  // ── Datos históricos desde InfluxDB (modo live) ──────────────────────────
  // Antes Históricos solo mostraba el buffer en RAM (~3 min). Ahora, en live,
  // consulta el rango real elegido a /api/reports/series. En mock cae al buffer.
  const [influx, setInflux] = useState<{ drives: SeriesRow[]; meters: SeriesRow[] } | null>(null)
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState('')

  const fetchSeries = useCallback(() => {
    if (DATA_MODE !== 'live') return
    const t = Date.now()
    const s = timeRange.windowMs === 0
      ? (timeRange.fixedStart ?? 0)
      : timeRange.windowMs > 0 ? t + timeRange.endOffset - timeRange.windowMs : 0
    const u = timeRange.windowMs === 0
      ? (timeRange.fixedEnd ?? t)
      : timeRange.endOffset === 0 ? t : t + timeRange.endOffset
    const from = s > 0 ? new Date(s).toISOString() : '-7d'
    const to = new Date(u).toISOString()
    const effStart = s > 0 ? s : t - 7 * 86400_000
    const windowSec = Math.min(3600, Math.max(10, Math.round((u - effStart) / 1000 / 400)))
    setHistLoading(true); setHistError('')
    authFetch('/api/reports/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, windowSec, bucket })
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d) => setInflux({ drives: d.drives || [], meters: d.meters || [] }))
      .catch((e) => setHistError(String(e.message || e)))
      .finally(() => setHistLoading(false))
  }, [timeRange, bucket])

  useEffect(() => {
    if (DATA_MODE !== 'live') return
    fetchSeries()
    const id = setInterval(fetchSeries, Math.max(5000, refreshMs))
    return () => clearInterval(id)
  }, [fetchSeries, refreshMs])

  // Buckets disponibles (vivo + archivos restaurados)
  useEffect(() => {
    if (DATA_MODE !== 'live') return
    authFetch('/api/reports/buckets')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && Array.isArray(d.buckets)) setBuckets(d.buckets) })
      .catch(() => { /* ignore */ })
  }, [])

  const live = DATA_MODE === 'live' && influx !== null

  // Fetch de series para un rango arbitrario (para el selector por gráfico)
  const fetchSeriesRange = useCallback(async (from: string, to: string, windowSec: number) => {
    const r = await authFetch('/api/reports/series', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, windowSec, bucket })
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json() as { drives: SeriesRow[]; meters: SeriesRow[] }
  }, [bucket])

  // Fetcher por gráfico de drive: trae su campo para el rango elegido
  const rf = (field: string, scale = 1) => (
    DATA_MODE === 'live'
      ? (from: string, to: string, ws: number) => fetchSeriesRange(from, to, ws).then(d => rowsToChart(d.drives || [], field, scale))
      : undefined
  )

  // Fetcher por medidor+campo (escala W→kW, V→kV)
  const mrf = (meterName: string, field: 'voltage' | 'current' | 'power' | 'pf') => (
    DATA_MODE === 'live'
      ? (from: string, to: string, ws: number) => fetchSeriesRange(from, to, ws).then(d => {
          const scale = (field === 'power' || field === 'voltage') ? 1 / 1000 : 1
          return (d.meters || [])
            .filter(r => r.name === meterName)
            .map(r => { const v = Number(r[field]); return { ts: new Date(r._time).getTime(), [field]: isNaN(v) ? 0 : v * scale } })
            .sort((a, b) => a.ts - b.ts)
        })
      : undefined
  )

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
  const meterVoltageSeries: SeriesDef[] = [{ key: 'voltage', label: 'Tensión', color: '#8b5cf6' }]
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
  // Una seccion por cada medidor con datos (antes solo 'PM8000' hardcodeado
  // — un PM7400 u otro medidor no aparecia en los charts)
  const meterNames = useConfigStore(s => s.config?.meterNames) ?? {}
  const cfgMeters = useConfigStore(s => s.config?.meters) ?? []
  const meterSections = useMemo(() => {
    const out: Array<{ name: string; data: MeterPoint[] }> = []
    for (const [name, arr] of meterHistory) {
      const data = arr.filter(p => (since === 0 || p.ts >= since) && p.ts <= until)
      if (data.length > 0) out.push({ name, data })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [meterHistory, since, until])

  // ── Series desde InfluxDB (live) ─────────────────────────────────────────
  const influxDrive = useMemo(() => {
    if (!live) return null
    const r = influx!.drives
    return {
      current: rowsToChart(r, 'current'),
      power: rowsToChart(r, 'power'),
      voltage: rowsToChart(r, 'voltage'),
      speed: rowsToChart(r, 'motor_speed'),
      frequency: rowsToChart(r, 'frequency'),
      igbt: rowsToChart(r, 'igbt_temp'),
      scr: rowsToChart(r, 'scr_temp'),
      cosphi: rowsToChart(r, 'cos_phi'),
    }
  }, [live, influx])

  const meterSectionsLive = useMemo(() => {
    if (!live) return null
    const byName = new Map<string, MeterPoint[]>()
    for (const r of influx!.meters) {
      const t = new Date(r._time).getTime()
      let arr = byName.get(r.name)
      if (!arr) { arr = []; byName.set(r.name, arr) }
      arr.push({
        ts: t,
        current: Number(r.current) || 0,
        power: (Number(r.power) || 0) / 1000,   // W → kW
        pf: Number(r.pf) || 0,
        voltage: (Number(r.voltage) || 0) / 1000 // V → kV
      })
    }
    return Array.from(byName.entries())
      .map(([name, data]) => ({ name, data: data.sort((a, b) => a.ts - b.ts) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [live, influx])

  // Mostrar TODOS los medidores configurados (aunque estén desconectados / sin
  // datos en el rango), en el orden de la config; luego cualquier otro con datos.
  const finalMeterSections = useMemo(() => {
    const src = meterSectionsLive || meterSections
    const dataByName = new Map(src.map(s => [s.name, s.data]))
    const out: Array<{ name: string; data: MeterPoint[] }> = []
    const seen = new Set<string>()
    for (const cm of cfgMeters) {
      if (!cm || !cm.name) continue
      out.push({ name: cm.name, data: dataByName.get(cm.name) || [] })
      seen.add(cm.name)
    }
    for (const s of src) if (!seen.has(s.name)) out.push(s)
    return out
  }, [meterSectionsLive, meterSections, cfgMeters])

  // ── Pérdida (balance): principal − Σ seleccionados, alineado por tiempo ──
  const lossConfig = useConfigStore(s => s.config?.lossMeter)
  const lossSeries = useMemo(() => {
    if (!lossConfig?.main) return null
    const subSet = new Set(lossConfig.subtract || [])
    const rows: { ts: number; loss: number }[] = []
    if (live && influx) {
      // filas ventaneadas/pivoteadas: _time alinea entre medidores. power en W → kW
      const byTime = new Map<string, { main?: number; sub: number }>()
      for (const r of influx.meters) {
        let e = byTime.get(r._time); if (!e) { e = { sub: 0 }; byTime.set(r._time, e) }
        const p = Number(r.power) || 0
        if (r.name === lossConfig.main) e.main = p
        else if (subSet.has(r.name)) e.sub += p
      }
      for (const [t, e] of byTime) if (e.main !== undefined) rows.push({ ts: new Date(t).getTime(), loss: (e.main - e.sub) / 1000 })
    } else {
      // buffer/mock: meterHistory ya en kW; alinear por ts redondeado
      const round = (ts: number) => Math.round(ts / 2000) * 2000
      const bucket = new Map<number, { main?: number; sub: number }>()
      for (const p of (meterHistory.get(lossConfig.main) || [])) { const k = round(p.ts); let e = bucket.get(k); if (!e) { e = { sub: 0 }; bucket.set(k, e) } e.main = p.power }
      for (const n of subSet) for (const p of (meterHistory.get(n) || [])) { const k = round(p.ts); let e = bucket.get(k); if (!e) { e = { sub: 0 }; bucket.set(k, e) } e.sub += p.power }
      for (const [k, e] of bucket) if (e.main !== undefined) rows.push({ ts: k, loss: e.main - e.sub })
    }
    return rows.filter(p => (since === 0 || p.ts >= since) && p.ts <= until).sort((a, b) => a.ts - b.ts)
  }, [lossConfig, live, influx, meterHistory, since, until])
  const lossSeriesDef: SeriesDef[] = [{ key: 'loss', label: 'Pérdida', color: '#E87722' }]
  // Energía acumulada de la pérdida (∫ potencia·dt, trapezoidal) en kWh
  const lossEnergy = useMemo(() => {
    if (!lossSeries || lossSeries.length === 0) return null
    const rows: { ts: number; energy: number }[] = []
    let acc = 0
    for (let i = 0; i < lossSeries.length; i++) {
      if (i > 0) {
        const dtH = (lossSeries[i].ts - lossSeries[i - 1].ts) / 3600000
        // guardia anti-hueco: si el salto es enorme (equipo caído) no integramos
        if (dtH > 0 && dtH <= 1) acc += ((lossSeries[i].loss + lossSeries[i - 1].loss) / 2) * dtH
      }
      rows.push({ ts: lossSeries[i].ts, energy: +acc.toFixed(2) })
    }
    return rows
  }, [lossSeries])
  const lossEnergyDef: SeriesDef[] = [{ key: 'energy', label: 'Energía pérdida', color: '#a855f7' }]

  // ── Todas las potencias de los medidores en un solo gráfico (kW) ──
  const POWER_PALETTE = ['#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899', '#84cc16']
  const allPowers = useMemo(() => {
    const names: string[] = []
    const byTime = new Map<number, Record<string, number>>()
    const add = (name: string, ts: number, powerKw: number) => {
      if (!names.includes(name)) names.push(name)
      let row = byTime.get(ts); if (!row) { row = { ts }; byTime.set(ts, row) }
      row[name] = powerKw
    }
    if (live && influx) {
      for (const r of influx.meters) add(r.name, new Date(r._time).getTime(), (Number(r.power) || 0) / 1000)
    } else {
      const round = (ts: number) => Math.round(ts / 2000) * 2000
      for (const [name, arr] of meterHistory) for (const p of arr) add(name, round(p.ts), p.power)
    }
    const data = [...byTime.values()].filter(r => (since === 0 || r.ts >= since) && r.ts <= until).sort((a, b) => a.ts - b.ts)
    const series: SeriesDef[] = names.sort().map((n, i) => ({ key: n, label: meterNames[n] || n, color: POWER_PALETTE[i % POWER_PALETTE.length] }))
    return { data, series }
  }, [live, influx, meterHistory, since, until, meterNames])

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <LineChart className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Tendencias</h2>

        <TimeRangePicker value={timeRange} onChange={setTimeRange} />

        <div className="ml-auto flex items-center gap-2">
          {/* Refresh interval selector */}
          <div className="relative">
            <button
              onClick={() => setShowRefresh(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
                showRefresh
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground hover:text-foreground border-input'
              )}
              title="Intervalo de refresco"
            >
              <Timer className="h-3.5 w-3.5" />
              {currentLabel}
            </button>
            {showRefresh && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-md min-w-[80px]">
                {REFRESH_OPTIONS.map(opt => (
                  <button
                    key={opt.ms}
                    onClick={() => { setRefreshMs(opt.ms); setShowRefresh(false) }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground',
                      refreshMs === opt.ms ? 'font-semibold text-primary' : 'text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Archivo: bucket vivo o un backup restaurado */}
          {buckets.length > 1 && (
            <select
              value={bucket}
              onChange={e => setBucket(e.target.value)}
              className="text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground"
              title="Fuente: datos vivos o un archivo restaurado"
            >
              {buckets.map(b => (
                <option key={b} value={b}>
                  {b === 'weg_drives' ? 'Vivo' : `Archivo ${b.replace('weg_archive_', '').replace(/_/g, '-')}`}
                </option>
              ))}
            </select>
          )}

          {/* Fuente de datos: InfluxDB (rango real) o buffer en RAM (mock) */}
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground" title={DATA_MODE === 'live' ? 'Datos históricos de InfluxDB' : 'Buffer en memoria (~3 min)'}>
            {histLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            {DATA_MODE === 'live' ? 'InfluxDB' : 'Buffer 3 min'}
          </span>
          {histError && <span className="text-xs text-destructive" title={histError}>error</span>}

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

      {/* Pestañas Drives / Medidores */}
      <div className="flex items-center gap-1 border-b border-border">
        {([['drives', `Bombas (${allNames.length})`], ['medidores', `Medidores (${finalMeterSections.length})`], ['potencias', 'Potencias'], ['perdida', 'Pérdida']] as const).map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setChartTab(k)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
              chartTab === k ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {lbl}
          </button>
        ))}
      </div>

      {chartTab === 'drives' && (<>
      {/* ── Corriente ───────────────────────────────── */}
      <TrendChart
        title="Corriente por Bomba (A)"
        data={influxDrive ? influxDrive.current : currentData}
        rangeFetch={rf('current')}
        series={driveSeries}
        unit="A"
        height={200}
        yDomain={['auto', 'auto']}
      />

      {/* ── Potencia + Tensión de Salida ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TrendChart
          title="Potencia por Bomba (kW)"
          data={influxDrive ? influxDrive.power : powerData}
          rangeFetch={rf('power')}
          series={driveSeries}
          unit="kW"
          height={200}
          yDomain={['auto', 'auto']}
        />
        <TrendChart
          title="Tensión de Salida (V)"
          data={influxDrive ? influxDrive.voltage : voltageData}
          rangeFetch={rf('voltage')}
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
            data={influxDrive ? influxDrive.speed : speedData}
            rangeFetch={rf('motor_speed')}
            series={cfwSeries}
            unit="RPM"
            height={200}
            yDomain={['auto', 'auto']}
          />
          <TrendChart
            title="Frecuencia de Salida — CFW900 (Hz)"
            data={influxDrive ? influxDrive.frequency : freqData}
            rangeFetch={rf('frequency')}
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
            data={influxDrive ? influxDrive.igbt : igbtData}
            rangeFetch={rf('igbt_temp')}
            series={cfwSeries}
            unit="°C"
            height={200}
          />
        )}
        {sswList.length > 0 && (
          <TrendChart
            title="Temperatura SCR — SSW900 (°C)"
            data={influxDrive ? influxDrive.scr : scrData}
            rangeFetch={rf('scr_temp')}
            series={sswSeries}
            unit="°C"
            height={200}
          />
        )}
      </div>

      {/* ── Factor de Potencia ───────────────────────── */}
      <TrendChart
        title="Factor de Potencia (Cos φ)"
        data={influxDrive ? influxDrive.cosphi : cosPhiData}
        rangeFetch={rf('cos_phi')}
        series={driveSeries}
        unit=""
        height={180}
        yDomain={[0, 1]}
      />
      </>)}

      {chartTab === 'potencias' && (
        allPowers.series.length === 0
          ? <div className="text-center text-muted-foreground text-sm py-10">No hay datos de potencia de medidores en el rango.</div>
          : <TrendChart title="Potencia por medidor (kW)" data={allPowers.data} series={allPowers.series} unit="kW" height={280} yDomain={['auto', 'auto']} />
      )}

      {chartTab === 'perdida' && (
        !lossConfig?.main
          ? <div className="text-center text-muted-foreground text-sm py-10">Configurá el balance en <strong>Configuración → Balance</strong> para ver la pérdida.</div>
          : (lossSeries && lossSeries.length > 0
            ? <>
                <TrendChart title="Pérdida — potencia (kW)" data={lossSeries} series={lossSeriesDef} unit="kW" height={240} yDomain={['auto', 'auto']} />
                {lossEnergy && <TrendChart title="Pérdida — energía acumulada (kWh)" data={lossEnergy} series={lossEnergyDef} unit="kWh" height={240} yDomain={['auto', 'auto']} decimals={1} />}
              </>
            : <div className="text-center text-muted-foreground text-sm py-10">Sin datos de pérdida en el rango.</div>)
      )}

      {chartTab === 'medidores' && (<>
        {finalMeterSections.length === 0
          ? <div className="text-center text-muted-foreground text-sm py-10">No hay datos de medidores en el rango.</div>
          : <>
      {/* ── Medidores de linea ───────────────────────── */}
      {finalMeterSections.map(({ name, data }) => {
        const collapsed = collapsedMeters[name] === true
        return (
        <div key={name} className="flex flex-col gap-3">
          <button
            onClick={() => setCollapsedMeters(s => ({ ...s, [name]: !collapsed }))}
            className="flex items-center gap-2 pt-2 border-t text-left w-full"
          >
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
            <Zap className={cn('h-4 w-4', data.length > 0 ? 'text-primary' : 'text-muted-foreground')} />
            <span className="text-sm font-semibold">{meterNames[name] || name}</span>
            <span className="text-xs text-muted-foreground">Medición de línea</span>
            {data.length === 0 && (
              <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">sin datos en el rango</span>
            )}
          </button>
          {!collapsed && (
            <div className="flex flex-col gap-4">
              <TrendChart
                title="Tensión L-L (kV)"
                data={data}
                rangeFetch={mrf(name, 'voltage')}
                series={meterVoltageSeries}
                unit="kV"
                height={180}
                yDomain={['auto', 'auto']}
                decimals={2}
              />
              <TrendChart
                title="Corriente (A)"
                data={data}
                rangeFetch={mrf(name, 'current')}
                series={meterCurrentSeries}
                unit="A"
                height={180}
                yDomain={['auto', 'auto']}
              />
              <TrendChart
                title="Potencia (kW)"
                data={data}
                rangeFetch={mrf(name, 'power')}
                series={meterPowerSeries}
                unit="kW"
                height={180}
                yDomain={['auto', 'auto']}
              />
              <TrendChart
                title="Factor de Potencia"
                data={data}
                rangeFetch={mrf(name, 'pf')}
                series={meterPfSeries}
                unit=""
                height={180}
                yDomain={[0, 1]}
                decimals={2}
              />
            </div>
          )}
        </div>
        )
      })}
          </>}
      </>)}
    </div>
  )
}
