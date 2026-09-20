/**
 * ReporteDiario — Resumen del día (server-side, desde InfluxDB)
 *
 * En modo live pide GET /api/reports/daily?date= : energía (kWh), horas de
 * operación reales (Δ run_hours del día), y estadísticas prom/mín/máx de
 * drives y medidores. Ya no depende de snapshots en el navegador.
 * En modo mock arma el mismo resumen desde el buffer en RAM (para la preview).
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { ClipboardList, Download, Mail, Wifi, WifiOff, Loader2, Zap, Clock, Gauge, RefreshCw } from 'lucide-react'
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
interface DriveSummary {
  name: string; type: string; site: string
  energyKwh: number | null; opHours: number | null; commErrors: number | null
  stats: { current: Stat; power: Stat; temp: Stat; cosPhi: Stat; frequency: Stat }
}
interface MeterSummary {
  name: string; displayName: string; energyKwh: number | null
  stats: { voltage: Stat; current: Stat; power: Stat; pf: Stat }
}
interface DailySummary {
  date: string; from: string; to: string; bucket: string
  drives: DriveSummary[]; meters: MeterSummary[]
  totals: { driveEnergyKwh: number | null }
}

// ─── helpers ────────────────────────────────────────────────────────────────
function pad(n: number) { return n.toString().padStart(2, '0') }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function fmtNum(v: number | null | undefined, d = 2) { return v == null || isNaN(v as number) ? '—' : (v as number).toFixed(d) }

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
      stats: { voltage: sc('voltage', 1000), current: sc('current'), power: sc('power', 1000), pf: sc('pf') },
    }
  })
  const driveEnergyKwh = drives.reduce((s, d) => s + (d.energyKwh || 0), 0)
  return { date, from: '', to: '', bucket: 'buffer', drives, meters, totals: { driveEnergyKwh } }
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReporteDiario() {
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const meterHistory = useDrivesStore(s => s.meterHistory)
  const connected = useDrivesStore(s => s.connected)
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
  const hasData = !!summary && (summary.drives.some(d => d.energyKwh != null) || summary.meters.some(m => m.energyKwh != null))

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Reporte Diario</h2>
        <span className="text-xs text-muted-foreground hidden md:inline">Resumen del día: energía, horas de operación y estadísticas</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Día</label>
            <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground" />
            <button onClick={loadSummary} title="Actualizar" className="text-muted-foreground hover:text-foreground">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
          {connected
            ? <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400"><Wifi className="h-3.5 w-3.5" />CONECTADO</span>
            : <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><WifiOff className="h-3.5 w-3.5" />SIN CONEXIÓN</span>}
        </div>
      </div>

      {error && <Card className="p-3 text-sm text-destructive">Error al cargar el resumen: {error}</Card>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Zap} label="Energía drives" value={fmtNum(totalDriveEnergy, 1)} unit="kWh" color="#f59e0b" />
        <Kpi icon={Gauge} label="Energía medidores" value={fmtNum(totalMeterEnergy, 1)} unit="kWh" color="#3b82f6" />
        <Kpi icon={Clock} label="Horas de operación" value={fmtNum(totalOpHours, 1)} unit="h" color="#22c55e" />
        <Kpi icon={ClipboardList} label="Equipos con datos" value={String((summary?.drives.filter(d => d.energyKwh != null).length ?? 0) + (summary?.meters.filter(m => m.energyKwh != null).length ?? 0))} />
      </div>

      {/* Drives */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Drives — energía, horas y estadísticas <span className="normal-case font-normal">(prom / mín–máx)</span>
        </p>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-border">
                {['Drive', 'Tipo'].map(h => <th key={h} className="py-1.5 px-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}
                {['Energía kWh', 'Hrs oper.', 'Corriente A', 'Potencia kW', 'Temp °C', 'Cos φ', 'Errores'].map(h => (
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
                  <td className="py-1.5 px-2 text-center tabular-nums">{fmtNum(d.opHours, 1)}</td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.current} /></td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.power} /></td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.temp} d={1} /></td>
                  <td className="py-1.5 px-2"><StatCell s={d.stats.cosPhi} d={3} /></td>
                  <td className="py-1.5 px-2 text-center tabular-nums">{d.commErrors == null ? '—' : d.commErrors}</td>
                </tr>
              ))}
              {(!summary || summary.drives.length === 0) && (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">{loading ? 'Cargando…' : 'Sin datos para este día'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Meters */}
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
