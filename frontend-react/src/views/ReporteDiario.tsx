/**
 * ReporteDiario — Resumen del día (server-side, desde InfluxDB)
 *
 * En modo live pide GET /api/reports/daily?date= : energía (kWh), horímetro
 * (totalizador interno del equipo: inicio/fin del día), horas de marcha,
 * estadísticas prom/mín/máx de bombas y medidores, potencia por fase de los
 * medidores, pérdida (balance de líneas) y los datos cargados a mano del día
 * (lluvia / altura del río, editables hasta el cierre).
 * En modo mock arma el resumen desde el buffer en RAM (para la preview).
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Download, Mail, Loader2, Zap, Clock, Gauge, RefreshCw, TrendingDown, CloudRain, Waves, Save, Lock } from 'lucide-react'
import { Card } from '../components/ui/card'
import { cn } from '@/lib/utils'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import type { HistoryPoint, MeterPoint } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useAuthStore, authFetch } from '../store/auth'
import { toast } from 'sonner'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// ─── Tipos del resumen (coinciden con el backend) ──────────────────────────
interface Stat { avg: number | null; min: number | null; max: number | null }
interface PhaseStat { avg: number | null; max: number | null }
interface DriveSummary {
  name: string; type: string; site: string
  energyKwh: number | null; opHours: number | null; commErrors: number | null
  runHoursStart?: number | null; runHoursEnd?: number | null
  stats: { current: Stat; power: Stat; temp: Stat; cosPhi: Stat; frequency: Stat }
}
interface MeterSummary {
  name: string; displayName: string; energyKwh: number | null
  stats: { voltage: Stat; current: Stat; power: Stat; pf: Stat; phase?: { a: PhaseStat | null; b: PhaseStat | null; c: PhaseStat | null } }
}
interface LossSummary {
  main: string; mainLabel: string; subtract: string[]; subtractLabels: string[]
  energyKwh: number | null; avgKw: number | null; maxKw: number | null
}
interface ManualData {
  date: string; rainMm: number | null; riverM: number | null
  updatedAt: string | null; updatedBy: string | null
  closeAt: string; locked: boolean; future: boolean
}
interface DailySummary {
  date: string; from: string; to: string; bucket: string
  drives: DriveSummary[]; meters: MeterSummary[]
  loss?: LossSummary | null
  totals: { driveEnergyKwh: number | null }
}

// ─── helpers ────────────────────────────────────────────────────────────────
function pad(n: number) { return n.toString().padStart(2, '0') }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function fmtNum(v: number | null | undefined, d = 2) { return v == null || isNaN(v as number) ? '—' : (v as number).toFixed(d) }
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Integración trapezoidal de potencia (kW) sobre ts (ms) -> kWh
function integrateKwh(pts: { ts: number; v: number }[]) {
  let e = 0
  for (let i = 1; i < pts.length; i++) {
    const dtH = (pts[i].ts - pts[i - 1].ts) / 3_600_000
    if (dtH > 0 && dtH < 1) e += ((pts[i].v + pts[i - 1].v) / 2) * dtH
  }
  return e
}
function stat(vals: number[]): Stat {
  if (!vals.length) return { avg: null, min: null, max: null }
  const min = Math.min(...vals), max = Math.max(...vals)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return { avg, min, max }
}

// Resumen client-side desde el buffer (solo modo mock/preview)
function buildLocalSummary(
  date: string,
  driveList: ReturnType<typeof selectDriveList>,
  meterList: ReturnType<typeof selectMeterList>,
  driveHistory: Map<string, HistoryPoint[]>,
  meterHistory: Map<string, MeterPoint[]>,
  meterName: (n: string) => string,
): DailySummary {
  const drives: DriveSummary[] = driveList.map(d => {
    const pts = driveHistory.get(d.name) ?? []
    const isCFW = d.type !== 'SSW900'
    const power = pts.map(p => p.power).filter(v => v != null)
    const energy = integrateKwh(pts.map(p => ({ ts: p.ts, v: p.power || 0 })))
    const temps = pts.map(p => (isCFW ? p.igbtTemp : p.scrTemp)).filter(v => v != null)
    return {
      name: d.name, type: d.type, site: d.site,
      energyKwh: pts.length ? energy : null, opHours: null, commErrors: null,
      runHoursStart: null, runHoursEnd: null,
      stats: {
        current: stat(pts.map(p => p.current).filter(v => v != null)),
        power: stat(power),
        temp: stat(temps),
        cosPhi: stat(pts.map(p => p.cosPhi).filter(v => v != null)),
        frequency: stat(pts.map(p => p.frequency).filter(v => v != null)),
      },
    }
  })
  const meters: MeterSummary[] = meterList.map(m => {
    const pts = meterHistory.get(m.name) ?? []
    const energy = integrateKwh(pts.map(p => ({ ts: p.ts, v: (p.power || 0) / 1000 })))
    const sc = (f: keyof MeterPoint, div = 1) => stat(pts.map(p => (p[f] as number) / div).filter(v => v != null))
    return {
      name: m.name, displayName: meterName(m.name), energyKwh: pts.length ? energy : null,
      stats: { voltage: sc('voltage', 1000), current: sc('current'), power: sc('power', 1000), pf: sc('pf'), phase: { a: null, b: null, c: null } },
    }
  })
  const driveEnergyKwh = drives.reduce((s, d) => s + (d.energyKwh || 0), 0)
  return { date, from: '', to: '', bucket: 'buffer', drives, meters, loss: null, totals: { driveEnergyKwh } }
}

// ─── Celda estadística (prom grande, mín–máx chico) ────────────────────────
function StatCell({ s, d = 2 }: { s: Stat; d?: number }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="tabular-nums font-semibold">{fmtNum(s.avg, d)}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">{fmtNum(s.min, d)}–{fmtNum(s.max, d)}</span>
    </div>
  )
}

// Celda media (grande) / máx (chica) para potencia por fase
function AvgMaxCell({ p }: { p: PhaseStat | null | undefined }) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="tabular-nums font-semibold">{fmtNum(p?.avg, 1)}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">máx {fmtNum(p?.max, 1)}</span>
    </div>
  )
}

// ─── KPI ────────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, unit, color }: { icon: any; label: string; value: string; unit?: string; color?: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="rounded-xl p-2.5" style={{ background: (color || 'var(--brand)') + '22' }}>
        <Icon className="h-5 w-5" style={{ color: color || 'hsl(var(--brand))' }} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums leading-none">{value}{unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}</div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">{label}</div>
      </div>
    </Card>
  )
}

// ─── Carga manual del día: lluvia (mm) y altura del río (m) ────────────────
// Editable hasta el cierre del día (reporte automático de la mañana siguiente);
// después queda de solo lectura salvo para el administrador.
function ManualCard({ date, isAdmin }: { date: string; isAdmin: boolean }) {
  const [data, setData] = useState<ManualData | null>(null)
  const [rain, setRain] = useState('')
  const [river, setRiver] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const apply = (d: ManualData) => {
    setData(d)
    setRain(d.rainMm == null ? '' : String(d.rainMm))
    setRiver(d.riverM == null ? '' : String(d.riverM))
  }

  useEffect(() => {
    let alive = true
    if (MODE === 'mock') {
      apply({ date, rainMm: null, riverM: null, updatedAt: null, updatedBy: null, closeAt: '', locked: false, future: date > todayStr() })
      return
    }
    setLoading(true)
    authFetch(`${API_BASE}/reports/manual?date=${date}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (alive) apply(d) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [date])

  const canEdit = !!data && !data.future && (!data.locked || isAdmin)
  const dirty = !!data && (rain !== (data.rainMm == null ? '' : String(data.rainMm)) || river !== (data.riverM == null ? '' : String(data.riverM)))

  async function save() {
    if (MODE === 'mock') { toast.info('Vista previa: en producción se guarda en el servidor'); return }
    setSaving(true)
    try {
      const r = await authFetch(`${API_BASE}/reports/manual`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, rainMm: rain.trim() === '' ? null : rain, riverM: river.trim() === '' ? null : river }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      apply(d)
      toast.success('Datos del día guardados')
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

  const input = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums disabled:opacity-60'
  return (
    <Card className="p-4 border-l-4" style={{ borderLeftColor: '#0ea5e9' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos del día (carga manual)</p>
        {data && !data.future && data.closeAt && (
          <span className={cn('flex items-center gap-1 text-[11px]', data.locked ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
            {data.locked && <Lock className="h-3 w-3" />}
            {data.locked
              ? `Día cerrado (${fmtDateTime(data.closeAt)})${isAdmin ? ' — como administrador podés corregirlo' : ''}`
              : `Cargar antes del cierre: ${fmtDateTime(data.closeAt)}`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="space-y-1">
          <span className="flex items-center gap-1.5 text-xs font-medium"><CloudRain className="h-3.5 w-3.5 text-sky-500" />Lluvia (mm)</span>
          <input type="number" inputMode="decimal" step="0.1" min="0" placeholder="Sin cargar" value={rain}
            onChange={e => setRain(e.target.value)} disabled={!canEdit || loading} className={input} />
        </label>
        <label className="space-y-1">
          <span className="flex items-center gap-1.5 text-xs font-medium"><Waves className="h-3.5 w-3.5 text-sky-500" />Altura del río (m)</span>
          <input type="number" inputMode="decimal" step="0.01" placeholder="Sin cargar" value={river}
            onChange={e => setRiver(e.target.value)} disabled={!canEdit || loading} className={input} />
        </label>
        <button onClick={save} disabled={!canEdit || !dirty || saving}
          className="flex items-center justify-center gap-2 h-9 rounded-md px-4 text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </button>
      </div>
      {data?.future && <p className="text-[11px] text-muted-foreground mt-2">No se pueden cargar datos de un día futuro.</p>}
      {data?.updatedAt && (
        <p className="text-[11px] text-muted-foreground mt-2">Última carga: {fmtDateTime(data.updatedAt)}{data.updatedBy ? ` por ${data.updatedBy}` : ''}</p>
      )}
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
// Sub-vista "Resumen diario" dentro de Reportes: sin cabecera propia (título +
// badge de conexión viven en el wrapper Reportes).
export default function DailyReport() {
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const meterHistory = useDrivesStore(s => s.meterHistory)
  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const meterList = useMemo(() => selectMeterList(meters), [meters])
  const meterNames = useConfigStore(s => s.config?.meterNames) ?? {}
  const isAdmin = useAuthStore(s => s.role === 'admin')
  const meterName = useCallback((n: string) => meterNames[n] || n, [meterNames])

  const [date, setDate] = useState(todayStr())
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<null | 'pdf' | 'email'>(null)

  const loadSummary = useCallback(async () => {
    if (MODE === 'mock') {
      setSummary(buildLocalSummary(date, driveList, meterList, driveHistory, meterHistory, meterName))
      return
    }
    setLoading(true); setError('')
    try {
      const r = await authFetch(`${API_BASE}/reports/daily?date=${date}`)
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      setSummary(await r.json())
    } catch (e: any) {
      setError(e.message); setSummary(null)
    } finally { setLoading(false) }
  }, [date, driveList, meterList, driveHistory, meterHistory, meterName])

  useEffect(() => { loadSummary() }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  async function downloadPDF() {
    setBusy('pdf')
    try {
      const r = await authFetch(`${API_BASE}/reports/daily/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `reporte-diario_${date}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { toast.error(`No se pudo generar el PDF: ${e.message}`) }
    finally { setBusy(null) }
  }

  async function sendEmail() {
    setBusy('email')
    try {
      const r = await authFetch(`${API_BASE}/reports/daily/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
      if (data?.emailed) toast.success(`Reporte enviado a ${data.to}`)
      else toast.warning(data?.emailError || 'No hay SMTP/destinatario configurado. El PDF quedó guardado en el servidor.')
    } catch (e: any) { toast.error(`No se pudo enviar: ${e.message}`) }
    finally { setBusy(null) }
  }

  const totalDriveEnergy = summary?.totals?.driveEnergyKwh ?? null
  const totalMeterEnergy = summary?.meters?.reduce((s, m) => s + (m.energyKwh || 0), 0) ?? null
  const totalOpHours = summary?.drives?.reduce((s, d) => s + (d.opHours || 0), 0) ?? null
  const loss = summary?.loss ?? null
  const hasData = !!summary && (summary.drives.some(d => d.energyKwh != null) || summary.meters.some(m => m.energyKwh != null))

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: selector de día */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground hidden md:inline">Resumen del día (00:00 → 24:00): energía, horas de marcha, pérdida y estadísticas</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Día</label>
          <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground" />
          <button onClick={loadSummary} title="Actualizar" className="text-muted-foreground hover:text-foreground">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && <Card className="p-3 text-sm text-destructive">Error al cargar el resumen: {error}</Card>}

      {/* Datos cargados a mano del día */}
      <ManualCard date={date} isAdmin={isAdmin} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Zap} label="Energía bombas" value={fmtNum(totalDriveEnergy, 1)} unit="kWh" color="#f59e0b" />
        <Kpi icon={Gauge} label="Energía medidores" value={fmtNum(totalMeterEnergy, 1)} unit="kWh" color="#3b82f6" />
        <Kpi icon={Clock} label="Horas de marcha" value={fmtNum(totalOpHours, 1)} unit="h" color="#22c55e" />
        <Kpi icon={TrendingDown} label="Pérdida" value={fmtNum(loss?.energyKwh, 1)} unit="kWh" color="#E87722" />
      </div>

      {/* Bombas */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Bombas — energía, horas y estadísticas <span className="normal-case font-normal">(prom / mín–máx)</span>
        </p>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-border">
                {['Bomba', 'Tipo'].map(h => <th key={h} className="py-1.5 px-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}
                {['Energía kWh', 'Horím. inicio', 'Horím. fin', 'Hrs marcha', 'Corriente A', 'Potencia kW', 'Temp °C', 'Cos φ', 'Errores'].map(h => (
                  <th key={h} className="py-1.5 px-2 text-center font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(summary?.drives ?? []).map(d => (
                <tr key={d.name} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="py-1.5 px-2 font-medium whitespace-nowrap">{d.name}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{d.type}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums font-semibold text-amber-600 dark:text-amber-400">{fmtNum(d.energyKwh, 1)}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums" title="Totalizador del equipo al inicio del día">{fmtNum(d.runHoursStart, 1)}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums" title="Última lectura del totalizador en el día">{fmtNum(d.runHoursEnd, 1)}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums">{fmtNum(d.opHours, 1)}</td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.current} /></td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.power} /></td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.temp} d={1} /></td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.cosPhi} d={3} /></td>
                  <td className="py-1.5 px-2 text-center tabular-nums">{d.commErrors == null ? '—' : d.commErrors}</td>
                </tr>
              ))}
              {(!summary || summary.drives.length === 0) && (
                <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">{loading ? 'Cargando…' : 'Sin datos para este día'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Medidores */}
      {(summary?.meters.length ?? 0) > 0 && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Medidores — energía y estadísticas <span className="normal-case font-normal">(prom / mín–máx)</span>
          </p>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Medidor</th>
                  {['Energía kWh', 'Tensión kV', 'Corriente A', 'Potencia kW', 'FP'].map(h => (
                    <th key={h} className="py-1.5 px-2 text-center font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary!.meters.map(m => (
                  <tr key={m.name} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium">{m.displayName}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums font-semibold text-blue-600 dark:text-blue-400">{fmtNum(m.energyKwh, 1)}</td>
                    <td className="py-1.5 px-2"><StatCell s={m.stats.voltage} d={3} /></td>
                    <td className="py-1.5 px-2"><StatCell s={m.stats.current} /></td>
                    <td className="py-1.5 px-2"><StatCell s={m.stats.power} /></td>
                    <td className="py-1.5 px-2"><StatCell s={m.stats.pf} d={3} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Medidores — potencia por fase */}
      {(summary?.meters.length ?? 0) > 0 && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Medidores — potencia por fase <span className="normal-case font-normal">(kW, media / máx del día)</span>
          </p>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="py-1.5 px-2 text-left font-semibold text-muted-foreground">Medidor</th>
                  {['Fase L1', 'Fase L2', 'Fase L3', 'Total trifásico'].map(h => (
                    <th key={h} className="py-1.5 px-2 text-center font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary!.meters.map(m => (
                  <tr key={m.name} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium">{m.displayName}</td>
                    <td className="py-1.5 px-2"><AvgMaxCell p={m.stats.phase?.a} /></td>
                    <td className="py-1.5 px-2"><AvgMaxCell p={m.stats.phase?.b} /></td>
                    <td className="py-1.5 px-2"><AvgMaxCell p={m.stats.phase?.c} /></td>
                    <td className="py-1.5 px-2"><AvgMaxCell p={{ avg: m.stats.power.avg, max: m.stats.power.max }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pérdida (balance de líneas) */}
      {loss && (
        <Card className="p-4 border-l-4" style={{ borderLeftColor: '#E87722' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              <span className="font-bold text-base">Pérdida — balance de líneas</span>
            </div>
            <div className="flex items-center gap-6">
              {[
                { label: 'Energía', value: fmtNum(loss.energyKwh, 1), unit: 'kWh' },
                { label: 'Potencia media', value: fmtNum(loss.avgKw, 1), unit: 'kW' },
                { label: 'Potencia máx', value: fmtNum(loss.maxKw, 1), unit: 'kW' },
              ].map(k => (
                <div key={k.label} className="text-right">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{k.label}</div>
                  <div className="text-2xl font-semibold tabular-nums leading-tight">{k.value} <span className="text-sm font-normal text-muted-foreground">{k.unit}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {loss.mainLabel} − ({loss.subtractLabels.length ? loss.subtractLabels.join(' + ') : 'nada'})
          </div>
        </Card>
      )}

      {/* Export */}
      <Card className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {MODE === 'mock'
            ? <span className="text-yellow-600 dark:text-yellow-400">Vista previa (buffer en RAM). En producción el resumen sale del histórico completo (InfluxDB) y el PDF se genera en el servidor.</span>
            : <span>Cada mañana el servidor genera automáticamente el PDF del día anterior y lo guarda{isAdmin ? ' (y lo envía por email si está configurado)' : ''}.</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPDF} disabled={MODE === 'mock' || busy !== null || !hasData}
            className={cn('flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
              'bg-primary hover:opacity-90 text-primary-foreground')}>
            {busy === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Descargar PDF
          </button>
          {isAdmin && (
            <button onClick={sendEmail} disabled={MODE === 'mock' || busy !== null || !hasData}
              className={cn('flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
                'border border-input bg-background hover:bg-accent')}>
              {busy === 'email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Enviar por email
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
