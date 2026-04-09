/**
 * ReporteDiario — Reporte diario tipo Agriplus
 *
 * Horas de uso = runHours(ahora) − runHours(ayer misma hora)
 * El snapshot se guarda en localStorage cada minuto automáticamente.
 * Excel se genera con SpreadsheetML (sin dependencias externas).
 */

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Download, Wifi, WifiOff } from 'lucide-react'
import { Card } from '../components/ui/card'
import { cn } from '@/lib/utils'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import type { Drive } from '../types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function pad(n: number) { return n.toString().padStart(2, '0') }

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fmtTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function fmtFull(d: Date) { return `${fmtDate(d)} ${fmtTime(d)}` }

function snapshotKey(d: Date) {
  return `runhours_${fmtDate(d)}_${pad(d.getHours())}`
}
function yesterdaySnapshotKey(d: Date) {
  const y = new Date(d)
  y.setDate(y.getDate() - 1)
  return snapshotKey(y)
}

type Snapshot = Record<string, number>

function loadSnapshot(key: string): Snapshot | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null }
  catch { return null }
}
function saveSnapshot(key: string, snap: Snapshot) {
  try { localStorage.setItem(key, JSON.stringify(snap)) } catch { /* ignore */ }
}

// ─── Hook snapshot ────────────────────────────────────────────────────────────

function useRunHoursSnapshot(drives: Map<string, Drive>) {
  const [yesterdaySnap, setYesterdaySnap] = useState<Snapshot | null>(null)

  useEffect(() => {
    function persist() {
      const now = new Date()
      const snap: Snapshot = {}
      for (const [name, d] of drives.entries()) {
        if (d.runHours != null) snap[name] = d.runHours
      }
      if (Object.keys(snap).length > 0) saveSnapshot(snapshotKey(now), snap)
      setYesterdaySnap(loadSnapshot(yesterdaySnapshotKey(now)))
    }
    persist()
    const id = setInterval(persist, 60_000)
    return () => clearInterval(id)
  }, [drives])

  return yesterdaySnap
}

// ─── Estado de drive ──────────────────────────────────────────────────────────

function driveStatus(d: Drive): { label: string; color: string } {
  if (!d.online)  return { label: 'SIN CONEXIÓN', color: '#9ca3af' }
  if (d.hasFault) return { label: 'FALLA',        color: '#ef4444' }
  if (d.running)  return { label: 'EN MARCHA',    color: '#22c55e' }
  return                  { label: 'LISTO',        color: '#16a34a' }
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

function buildPDF(
  drives: Drive[],
  yesterdaySnap: Snapshot | null,
  meters: ReturnType<typeof selectMeterList>,
  meterDisplayName: (name: string) => string,
  now: Date
) {
  const statusBadge = (d: Drive) => {
    const { label, color } = driveStatus(d)
    return `<span style="display:inline-block;padding:2px 8px;border-radius:9px;font-size:9px;font-weight:700;color:#fff;background:${color};-webkit-print-color-adjust:exact;print-color-adjust:exact">${label}</span>`
  }

  const driveRowsHtml = drives.map(d => {
    const temp = d.type === 'CFW900' ? d.igbtTemp : d.scrTemp
    const prevHours = yesterdaySnap?.[d.name]
    const horasUsadas = prevHours != null
      ? Math.max(0, d.runHours - prevHours).toFixed(1)
      : '<span style="color:#9ca3af">N/D</span>'
    return `<tr>
      <td>${d.displayName ?? d.name}</td>
      <td>${d.site}</td>
      <td>${d.type}</td>
      <td>${statusBadge(d)}</td>
      <td>${(d.current ?? 0).toFixed(2)}</td>
      <td>${(d.power ?? 0).toFixed(2)}</td>
      <td>${(temp ?? 0).toFixed(1)}</td>
      <td>${d.hoursEnergized ?? 0}</td>
      <td>${d.hoursEnabled ?? 0}</td>
      <td>${(d.runHours ?? 0).toFixed(1)}</td>
      <td><strong>${horasUsadas}</strong></td>
      <td>${(d.cosPhi ?? 0).toFixed(3)}</td>
    </tr>`
  }).join('')

  const meterRowsHtml = meters.map(m => `<tr>
    <td>${meterDisplayName(m.name)}</td>
    <td>${m.online
      ? '<span style="color:#22c55e;font-weight:700">EN LÍNEA</span>'
      : '<span style="color:#9ca3af">SIN CONEXIÓN</span>'
    }</td>
    <td>${((m.voltage ?? 0) / 1000).toFixed(3)}</td>
    <td>${(m.current ?? 0).toFixed(2)}</td>
    <td>${((m.power ?? 0) / 1000).toFixed(2)}</td>
    <td>${(m.pf ?? 0).toFixed(3)}</td>
  </tr>`).join('')

  const meterSection = meters.length > 0 ? `
    <h3>Medidores — Línea General</h3>
    <table>
      <thead><tr>
        <th>Medidor</th><th>Estado</th><th>V (kV)</th><th>I (A)</th><th>P (kW)</th><th>FP</th>
      </tr></thead>
      <tbody>${meterRowsHtml}</tbody>
    </table>` : ''

  const total   = drives.length
  const online  = drives.filter(d => d.online).length
  const running = drives.filter(d => d.running).length
  const faults  = drives.filter(d => d.hasFault).length
  const offline = total - online

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Monitoreo de Drivers</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #222; background: #fff; }

  .header { display: flex; align-items: center; justify-content: space-between;
            padding: 14px 20px 10px; border-bottom: 3px solid #E87722; }
  .header-title { font-size: 15px; font-weight: 700; color: #333; line-height: 1.3; }
  .header-sub { font-size: 9px; color: #888; margin-top: 3px; }
  .header-right { text-align: right; }
  .header-date { font-size: 13px; font-weight: 700; color: #E87722; }
  .header-time { font-size: 9px; color: #888; margin-top: 2px; }

  .summary { display: flex; gap: 10px; padding: 10px 20px;
             background: #f8f8f8; border-bottom: 1px solid #e5e5e5; }
  .badge { background: #fff; border: 1px solid #e5e5e5; border-radius: 6px;
           padding: 5px 12px; text-align: center; min-width: 72px; }
  .badge-val { font-size: 20px; font-weight: 700; line-height: 1; }
  .badge-lbl { font-size: 8px; color: #888; text-transform: uppercase; margin-top: 2px; }

  .section { padding: 12px 20px; }
  h3 { font-size: 10px; font-weight: 700; color: #444; text-transform: uppercase;
       letter-spacing: .5px; border-bottom: 1px solid #e5e5e5;
       padding-bottom: 4px; margin: 14px 0 6px; }
  h3:first-child { margin-top: 0; }

  table { border-collapse: collapse; width: 100%; font-size: 9px; }
  th { background: #E87722; color: #fff; padding: 4px 5px;
       text-align: center; font-weight: 700; white-space: nowrap; }
  td { border-bottom: 1px solid #eee; padding: 3px 5px;
       text-align: right; white-space: nowrap; }
  td:first-child, td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: left; }
  tr:nth-child(even) td { background: #fafafa; }

  .footer { border-top: 1px solid #e5e5e5; padding: 6px 20px;
            text-align: center; font-size: 8px; color: #aaa; }

  @media print {
    @page { margin: 0; size: A4 landscape; }
    body { padding: 1cm; }
    .summary, th, tr:nth-child(even) td {
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
  }
</style></head><body>

<div class="header">
  <div style="display:flex;align-items:center;gap:14px">
    <img src="${window.location.origin}/agriplus.png" style="height:40px;width:auto" alt="agriplus"/>
    <div>
    <div class="header-title">Monitoreo de Drivers</div>
    <div class="header-sub">
      Hrs Usadas (24h) = runHours actual − runHours ayer misma hora &nbsp;|&nbsp; Tecno Electric S.A.
    </div>
    </div>
  </div>
  <div class="header-right">
    <div class="header-date">${fmtDate(now)}</div>
    <div class="header-time">Generado: ${fmtTime(now)}</div>
  </div>
</div>

<div class="summary">
  <div class="badge"><div class="badge-val" style="color:#374151">${total}</div><div class="badge-lbl">Total</div></div>
  <div class="badge"><div class="badge-val" style="color:#22c55e">${online}</div><div class="badge-lbl">En Línea</div></div>
  <div class="badge"><div class="badge-val" style="color:#3b82f6">${running}</div><div class="badge-lbl">En Marcha</div></div>
  <div class="badge"><div class="badge-val" style="color:#ef4444">${faults}</div><div class="badge-lbl">Con Falla</div></div>
  <div class="badge"><div class="badge-val" style="color:#E87722">${offline}</div><div class="badge-lbl">Desconect.</div></div>
</div>

<div class="section">
  <h3>Estado de Drives</h3>
  <table>
    <thead><tr>
      <th>Drive</th><th>Sitio</th><th>Tipo</th><th>Estado</th>
      <th>I (A)</th><th>P (kW)</th><th>Temp °C</th>
      <th>Hrs Energizado</th><th>Hrs Habilitado</th>
      <th>Hrs Totales</th><th>Hrs Usadas (24h)</th><th>Cos φ</th>
    </tr></thead>
    <tbody>${driveRowsHtml}</tbody>
  </table>
  ${meterSection}
</div>

<div class="footer">
  Reporte generado automáticamente por Monitoreo de Drivers &nbsp;|&nbsp;
  Powered by <strong>Tecno Electric S.A.</strong> &nbsp;|&nbsp; ${fmtFull(now)}
</div>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 500)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReporteDiario() {
  const drives    = useDrivesStore(s => s.drives)
  const meters    = useDrivesStore(s => s.meters)
  const connected = useDrivesStore(s => s.connected)

  const driveList  = useMemo(() => selectDriveList(drives), [drives])
  const meterList  = useMemo(() => selectMeterList(meters), [meters])
  const meterNames = useConfigStore(s => s.config?.meterNames) ?? {}

  function meterDisplayName(name: string) { return meterNames[name] || name }

  const yesterdaySnap = useRunHoursSnapshot(drives)
  const [tick, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 30_000); return () => clearInterval(id) }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [tick])

  const total   = driveList.length
  const online  = driveList.filter(d => d.online).length
  const running = driveList.filter(d => d.running).length
  const faults  = driveList.filter(d => d.hasFault).length
  const offline = total - online

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Reporte Diario</h2>
        <span className="text-xs text-muted-foreground">
          Hrs usadas = variación de runHours vs. ayer a la misma hora
        </span>
        <div className="ml-auto">
          {connected
            ? <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400"><Wifi className="h-3.5 w-3.5" />CONECTADO</span>
            : <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><WifiOff className="h-3.5 w-3.5" />SIN CONEXIÓN</span>
          }
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',         val: total,   color: 'text-foreground' },
          { label: 'En Línea',      val: online,  color: 'text-green-500' },
          { label: 'En Marcha',     val: running, color: 'text-blue-500' },
          { label: 'Con Falla',     val: faults,  color: 'text-red-500' },
          { label: 'Desconectados', val: offline, color: 'text-orange-500' },
        ].map(({ label, val, color }) => (
          <Card key={label} className="p-3 text-center">
            <div className={cn('text-3xl font-bold', color)}>{val}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      {/* Drives table */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado de Drives</p>
          {!yesterdaySnap && (
            <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
              ⚠ Sin snapshot de ayer — Hrs Usadas disponible tras 24 h de operación
            </span>
          )}
        </div>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-border">
                {['Drive','Sitio','Tipo','Estado'].map(h => (
                  <th key={h} className="py-1.5 px-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
                {['I (A)','P (kW)','Temp °C','Hrs Energizado','Hrs Habilitado','Hrs Totales','Hrs Usadas (24h)','Cos φ'].map(h => (
                  <th key={h} className="py-1.5 px-2 text-center font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {driveList.map(d => {
                const { label, color } = driveStatus(d)
                const temp = d.type === 'CFW900' ? d.igbtTemp : d.scrTemp
                const prevHours = yesterdaySnap?.[d.name]
                const horasUsadas = prevHours != null
                  ? Math.max(0, (d.runHours ?? 0) - prevHours).toFixed(1)
                  : null
                return (
                  <tr key={d.name} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium whitespace-nowrap">{d.displayName ?? d.name}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{d.site}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{d.type}</td>
                    <td className="py-1.5 px-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                            style={{ background: color }}>
                        {label}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{(d.current ?? 0).toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{(d.power ?? 0).toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{(temp ?? 0).toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-center text-muted-foreground">{d.hoursEnergized ?? 0}</td>
                    <td className="py-1.5 px-2 text-center text-muted-foreground">{d.hoursEnabled ?? 0}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{(d.runHours ?? 0).toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums font-semibold">
                      {horasUsadas != null
                        ? <span className="text-orange-500">{horasUsadas}</span>
                        : <span className="text-muted-foreground text-[10px]">N/D*</span>
                      }
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{(d.cosPhi ?? 0).toFixed(3)}</td>
                  </tr>
                )
              })}
              {driveList.length === 0 && (
                <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">Sin drives conectados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Meters table */}
      {meterList.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Medidores — Línea General</p>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-border">
                  {['Medidor','Estado'].map(h => (
                    <th key={h} className="py-1.5 px-2 text-center font-semibold text-muted-foreground">{h}</th>
                  ))}
                  {['V (kV)','I (A)','P (kW)','FP'].map(h => (
                    <th key={h} className="py-1.5 px-2 text-center font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meterList.map(m => (
                  <tr key={m.name} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium text-center">{meterDisplayName(m.name)}</td>
                    <td className="py-1.5 px-2 text-center">
                      {m.online
                        ? <span className="text-green-500 font-semibold">EN LÍNEA</span>
                        : <span className="text-muted-foreground">SIN CONEXIÓN</span>
                      }
                    </td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{((m.voltage ?? 0) / 1000).toFixed(3)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{(m.current ?? 0).toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{((m.power ?? 0) / 1000).toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{(m.pf ?? 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Export buttons */}
      <Card className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Generado:</span> {fmtFull(now)}
          {!yesterdaySnap && (
            <span className="ml-3 text-yellow-600 dark:text-yellow-400">
              * Hrs Usadas se calculan automáticamente. Disponibles tras 24 h de operación.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => buildPDF(driveList, yesterdaySnap, meterList, meterDisplayName, new Date())}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors',
              'bg-orange-500 hover:bg-orange-600 text-white'
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar PDF
          </button>
        </div>
      </Card>

    </div>
  )
}
