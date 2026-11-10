import { useMemo, useState } from 'react'
import { useBrandingStore } from '../store/branding'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import type { HistoryPoint, MeterPoint } from '../store/drives'
import { Download, FileSpreadsheet, Sheet as SheetIcon, WifiOff, Loader2, ClipboardList, FileDown, FileText } from 'lucide-react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { useLicense } from '../store/license'
import { cn, escapeHtml } from '@/lib/utils'
import { mergeByTimestamp } from '@/lib/timeline'
import { descargarCSV, descargarBlob } from '@/lib/csv'
import { resolucionPorDefecto } from '@/lib/exportar'
import { downloadXlsx, type Sheet } from '@/lib/xlsx'
import { toast } from 'sonner'
import DailyReport from './ReporteDiario'
import Informes from './Informes'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
// Números en pantalla con coma decimal
const loc = (v: number, d: number) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// Secciones del UI -> campos de InfluxDB para el reporte historico del backend
const SECTION_FIELDS: Record<string, string[]> = {
  current: ['current', 'voltage'],
  power: ['power'],
  temps: ['motor_temp', 'igbt_temp', 'scr_temp'],
}

// ─── helpers ────────────────────────────────────────────────────────────────

function toInputVal(epoch: number) {
  const d = new Date(epoch)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtFull(epoch: number) {
  const d = new Date(epoch)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ─── CSV generation ─────────────────────────────────────────────────────────

// ─── PDF via print window ────────────────────────────────────────────────────

function openPrintWindow(html: string) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 400)
}

function buildTableHTML(
  title: string,
  headers: string[],
  rows: (string | number)[][]
): string {
  // Todo dato interpolado se escapa: los nombres de drives/medidores vienen
  // de config y MQTT, y este HTML se ejecuta con document.write (XSS)
  const th = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')
  const trs = rows.map(r =>
    `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
  ).join('')
  return `
    <h3>${escapeHtml(title)}</h3>
    <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
  `
}

// ─── SECTION configs ─────────────────────────────────────────────────────────

type Section = 'current' | 'power' | 'temps'

const SECTION_LABELS: Record<Section, string> = {
  current: 'Corriente por Bomba (A)',
  power:   'Potencia por Bomba (kW)',
  temps:   'Temperaturas (°C)',
}

type Tipo = 'bombas' | 'medidores' | 'caudal' | 'campo'
const RESOLUCIONES: { v: 60 | 900 | 3600 | 86400; label: string }[] = [
  { v: 60, label: '1 MIN' }, { v: 900, label: '15 MIN' }, { v: 3600, label: '1 H' }, { v: 86400, label: '1 DÍA' },
]

// ─── Component ───────────────────────────────────────────────────────────────

// ─── Wrapper: Reportes con dos sub-vistas ─────────────────────────────────────
// Unifica "Resumen diario" (server-side, InfluxDB) y "Exportar datos" (rangos
// CSV/XLSX/PDF) en una sola pestaña con control segmentado.
type ReportTab = 'diario' | 'informes' | 'export'

export default function Reportes() {
  const [tab, setTab] = useState<ReportTab>('diario')
  const connected = useDrivesStore(s => s.connected)

  const tabs: { id: ReportTab; label: string; icon: any }[] = [
    { id: 'diario', label: 'Resumen diario', icon: ClipboardList },
    { id: 'informes', label: 'Informes', icon: FileText },
    { id: 'export', label: 'Exportar datos', icon: FileDown },
  ]

  return (
    <div className="flex flex-col gap-2">
      {/* Cabecera compartida */}
      <div className="flex items-center gap-3 flex-wrap bg-card border px-3 min-h-[44px] py-1.5">
        <h1 className="text-xs font-bold tracking-widest">REPORTES</h1>
        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === t.id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          {!connected && <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--st-com)' }}><WifiOff className="h-3.5 w-3.5" />SIN CONEXIÓN</span>}
        </div>
      </div>

      {tab === 'diario' ? <DailyReport /> : tab === 'informes' ? <Informes /> : <ExportReport />}
    </div>
  )
}

// Sub-vista "Exportar datos": sin cabecera propia (vive en el wrapper Reportes).
function ExportReport() {
  const drives       = useDrivesStore(s => s.drives)
  const meters       = useDrivesStore(s => s.meters)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const meterHistory = useDrivesStore(s => s.meterHistory)

  const driveList  = useMemo(() => selectDriveList(drives),  [drives])
  const meterList  = useMemo(() => selectMeterList(meters),  [meters])
  const meterNames = useConfigStore(s => s.config?.meterNames) ?? {}

  function meterDisplayName(name: string) { return meterNames[name] || name }

  const now = Date.now()
  const [fromVal, setFromVal] = useState(toInputVal(now - 30 * 60_000))
  const [toVal,   setToVal]   = useState(toInputVal(now + 24 * 60 * 60_000))

  const [selDrives,   setSelDrives]   = useState<Set<string>>(new Set())
  const [selSections, setSelSections] = useState<Set<Section>>(new Set(['current', 'power', 'temps']))
  const hasCaudales = useLicense(l => l.hasModule('caudales'))
  const hasCampo = useLicense(l => l.hasModule('unifilar') || l.hasModule('generadores'))
  const [selTipos, setSelTipos] = useState<Set<Tipo>>(new Set(['bombas']))
  const [resol, setResol] = useState<60 | 900 | 3600 | 86400>(60)
  const [resolManual, setResolManual] = useState(false)
  const [downloading, setDownloading] = useState<null | 'csv' | 'pdf' | 'xlsx'>(null)
  const [includeSummary, setIncludeSummary] = useState(true)

  // selected drives defaults to all when nothing explicitly chosen
  const activeDrives = selDrives.size > 0
    ? driveList.filter(d => selDrives.has(d.name))
    : driveList

  // Conjunto vacío = todas. Al destildar una con "todas" marcadas, quedan las demás
  function toggleDrive(name: string) {
    setSelDrives(prev => {
      const next = new Set(prev.size === 0 ? driveList.map(d => d.name) : prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next.size === driveList.length ? new Set() : next
    })
  }

  // Atajos de período
  const rango = (desde: number, hasta: number) => { setFromVal(toInputVal(desde)); setToVal(toInputVal(hasta)) }
  const atajos: { label: string; fn: () => void }[] = (() => {
    const t = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0); const hoy = d0.getTime()
    const mes = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime()
    return [
      { label: 'HOY', fn: () => rango(hoy, t) },
      { label: 'AYER', fn: () => rango(hoy - 86400_000, hoy) },
      { label: '24 H', fn: () => rango(t - 86400_000, t) },
      { label: '7 DÍAS', fn: () => rango(t - 7 * 86400_000, t) },
      { label: 'MES', fn: () => rango(mes, t) },
    ]
  })()

  function toggleSection(s: Section) {
    setSelSections(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  function toggleTipo(t: Tipo) {
    setSelTipos(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }
  // Las secciones (corriente/potencia/temps) son de bombas: sin Bombas no se exportan
  const secOn = (s: Section) => selTipos.has('bombas') && selSections.has(s)

  // ── filtered history in selected range ──────────────────────────────────
  const since = new Date(fromVal).getTime()
  const until = new Date(toVal).getTime()
  // Hasta que el usuario elija, la resolución sigue al largo del rango
  const resolucion = resolManual ? resol : resolucionPorDefecto(until - since)

  function getDriveHistory(name: string): HistoryPoint[] {
    return (driveHistory.get(name) ?? []).filter(p => p.ts >= since && p.ts <= until)
  }

  function getMeterHistory(name: string): MeterPoint[] {
    return (meterHistory.get(name) ?? []).filter(p => p.ts >= since && p.ts <= until)
  }
  // Cualquier medidor con datos cuenta (antes solo 'PM8000' hardcodeado)
  const anyMeterData = [...meterHistory.keys()].some(n => getMeterHistory(n).length > 0)

  // ── infer available data range from buffer ────────────────────────────────
  let bufStart: number | null = null
  let bufEnd: number | null = null
  for (const arr of driveHistory.values()) {
    if (arr.length > 0) {
      const s = arr[0].ts, e = arr[arr.length - 1].ts
      if (bufStart == null || s < bufStart) bufStart = s
      if (bufEnd   == null || e > bufEnd)   bufEnd   = e
    }
  }
  const outOfRange = bufStart != null && (until < bufStart || since > (bufEnd ?? 0))
  const noData     = activeDrives.every(d => getDriveHistory(d.name).length === 0) && !anyMeterData

  // ── Matriz timestamp × drives ──────────────────────────────────────────────
  // Los puntos de un mismo ciclo de poll llegan con ms de diferencia por drive,
  // asi que el join se hace por cercania de timestamp (mergeByTimestamp) y no
  // por igualdad exacta — antes cada muestra generaba una fila casi vacia.
  function buildMatrix(
    sel: typeof activeDrives,
    field: keyof HistoryPoint,
    decimals: number,
    blank: string,
    headerSuffix = ''
  ): { headers: string[]; rows: string[][] } {
    const series: Record<string, HistoryPoint[]> = {}
    for (const d of sel) series[d.name] = getDriveHistory(d.name)
    const rows = mergeByTimestamp(series).map(({ ts, points }) => {
      const row: string[] = [fmtFull(ts)]
      for (const d of sel) {
        const v = points[d.name]?.[field]
        row.push(v != null ? (v as number).toFixed(decimals) : blank)
      }
      return row
    })
    const headers = ['Timestamp', ...sel.map(d => `${d.displayName ?? d.name}${headerSuffix}`)]
    return { headers, rows }
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')

    if (secOn('current')) {
      const { headers, rows } = buildMatrix(activeDrives, 'current', 2, '')
      descargarCSV(`corriente_${ts}.csv`, headers, rows)
    }

    if (secOn('power')) {
      const { headers, rows } = buildMatrix(activeDrives, 'power', 2, '')
      descargarCSV(`potencia_${ts}.csv`, headers, rows)
    }

    if (secOn('temps')) {
      const cfwDrives = activeDrives.filter(d => d.type === 'CFW900')
      const sswDrives = activeDrives.filter(d => d.type === 'SSW900')
      if (cfwDrives.length > 0) {
        const { headers, rows } = buildMatrix(cfwDrives, 'igbtTemp', 1, '', ' IGBT°C')
        descargarCSV(`temp_igbt_${ts}.csv`, headers, rows)
      }
      if (sswDrives.length > 0) {
        const { headers, rows } = buildMatrix(sswDrives, 'scrTemp', 1, '', ' SCR°C')
        descargarCSV(`temp_scr_${ts}.csv`, headers, rows)
      }
    }

    if (selTipos.has('medidores')) {
      for (const m of meterList) {
        const pts = getMeterHistory(m.name)
        if (pts.length === 0) continue
        const rows: string[][] = [['Timestamp', 'Corriente (A)', 'Potencia (kW)', 'Factor de Potencia']]
        for (const p of pts) {
          rows.push([fmtFull(p.ts), p.current.toFixed(2), p.power.toFixed(2), p.pf.toFixed(3)])
        }
        const slug = m.name.replace(/\s+/g, '_').toLowerCase()
        descargarCSV(`${slug}_${ts}.csv`, rows[0], rows.slice(1))
      }
    }
  }

  // ── PDF export ─────────────────────────────────────────────────────────────
  function exportPDF() {
    let body = ''

    if (secOn('current')) {
      const { headers, rows } = buildMatrix(activeDrives, 'current', 2, '-')
      body += buildTableHTML('Corriente por Bomba (A)', headers, rows)
    }

    if (secOn('power')) {
      const { headers, rows } = buildMatrix(activeDrives, 'power', 2, '-')
      body += buildTableHTML('Potencia por Bomba (kW)', headers, rows)
    }

    if (secOn('temps')) {
      const cfwDrives = activeDrives.filter(d => d.type === 'CFW900')
      const sswDrives = activeDrives.filter(d => d.type === 'SSW900')
      if (cfwDrives.length > 0) {
        const { headers, rows } = buildMatrix(cfwDrives, 'igbtTemp', 1, '-')
        body += buildTableHTML('Temperatura IGBT — CFW900 (°C)', headers, rows)
      }
      if (sswDrives.length > 0) {
        const { headers, rows } = buildMatrix(sswDrives, 'scrTemp', 1, '-')
        body += buildTableHTML('Temperatura SCR — SSW900 (°C)', headers, rows)
      }
    }

    if (selTipos.has('medidores')) {
      for (const m of meterList) {
        const pts = getMeterHistory(m.name)
        if (pts.length === 0) continue
        const rows = pts.map(p => [fmtFull(p.ts), p.current.toFixed(2), p.power.toFixed(2), p.pf.toFixed(3)])
        body += buildTableHTML(`Medidor — ${meterDisplayName(m.name)}`, ['Timestamp', 'Corriente (A)', 'Potencia (kW)', 'FP'], rows)
      }
    }

    // pie de la marca (Configuración → Marca); vacío = sin pie
    const pie = useBrandingStore.getState().footer.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Reporte de Bombas</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }
  h1   { font-size: 16px; margin-bottom: 2px; }
  h2   { font-size: 12px; color: #555; margin-top: 0; }
  h3   { font-size: 12px; margin: 18px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  th, td { border: 1px solid #ccc; padding: 3px 6px; text-align: right; white-space: nowrap; }
  th     { background: #f0f0f0; text-align: center; font-weight: 600; }
  td:first-child { text-align: left; }
  @media print { @page { margin: 1cm; } }
</style></head><body>
<h1>Reporte — Monitoreo de Bombas</h1>
<h2>Generado: ${fmtFull(Date.now())} &nbsp;|&nbsp; Rango: ${fmtFull(since)} – ${fmtFull(until)}</h2>
${body || '<p>Sin datos en el rango seleccionado.</p>'}
${pie ? `<p style="margin-top:24px; font-size:9px; color:#888;">Powered by ${pie}</p>` : ''}
</body></html>`

    openPrintWindow(html)
  }

  // ── XLSX (mock): un libro con una hoja por sección ─────────────────────────
  function exportXLSX() {
    const sheets: Sheet[] = []
    if (secOn('current')) {
      const { headers, rows } = buildMatrix(activeDrives, 'current', 2, '')
      if (rows.length) sheets.push({ name: 'Corriente A', headers, rows })
    }
    if (secOn('power')) {
      const { headers, rows } = buildMatrix(activeDrives, 'power', 2, '')
      if (rows.length) sheets.push({ name: 'Potencia kW', headers, rows })
    }
    if (secOn('temps')) {
      const cfw = activeDrives.filter(d => d.type === 'CFW900')
      const ssw = activeDrives.filter(d => d.type === 'SSW900')
      if (cfw.length) { const { headers, rows } = buildMatrix(cfw, 'igbtTemp', 1, ''); if (rows.length) sheets.push({ name: 'Temp IGBT', headers, rows }) }
      if (ssw.length) { const { headers, rows } = buildMatrix(ssw, 'scrTemp', 1, ''); if (rows.length) sheets.push({ name: 'Temp SCR', headers, rows }) }
    }
    if (selTipos.has('medidores')) {
      for (const m of meterList) {
        const pts = getMeterHistory(m.name)
        if (!pts.length) continue
        sheets.push({
          name: meterDisplayName(m.name).slice(0, 28),
          headers: ['Timestamp', 'Corriente A', 'Potencia kW', 'FP'],
          rows: pts.map(p => [fmtFull(p.ts), +p.current.toFixed(2), +p.power.toFixed(2), +p.pf.toFixed(3)]),
        })
      }
    }
    if (!sheets.length) { toast.error('Sin datos en el rango seleccionado'); return }
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
    downloadXlsx(`weg-reporte_${ts}.xlsx`, sheets)
  }

  // ── Reporte histórico desde el backend (InfluxDB, hasta 365 días) ──────────
  // Reemplaza al buffer en RAM (~3 min) en modo live. Devuelve el archivo listo.
  async function downloadHistorical(kind: 'csv' | 'pdf' | 'xlsx') {
    setDownloading(kind)
    try {
      const fields = [...selSections].flatMap(s => SECTION_FIELDS[s] || [])
      const body = {
        tipos: [...selTipos],
        resolucion,
        from: new Date(fromVal).toISOString(),
        to: new Date(toVal).toISOString(),
        devices: activeDrives.map(d => d.name),
        fields,  // vacío => el backend incluye todos los campos
        title: 'Reporte WEG SCADA — Datos',
        summary: kind === 'xlsx' ? includeSummary : undefined,  // hoja resumen (energía + prom/mín/máx)
      }
      const r = await authFetch(`${API_BASE}/reports/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (r.status === 404) { toast.error('Sin datos en el rango seleccionado'); return }
      if (!r.ok) {
        const err = await r.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${r.status}`)
      }
      const blob = await r.blob()
      // CSV con varios tipos llega como .zip: el nombre manda el servidor
      const nombre = /filename="?([^";]+)"?/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? `weg-datos.${kind}`
      descargarBlob(nombre, blob)
    } catch (e: any) {
      toast.error(`Error al generar el reporte: ${e.message}`)
    } finally {
      setDownloading(null)
    }
  }

  // En live los reportes salen del histórico (InfluxDB); en mock, del buffer
  const onCSV = () => (MODE === 'mock' ? exportCSV() : downloadHistorical('csv'))
  const onPDF = () => (MODE === 'mock' ? exportPDF() : downloadHistorical('pdf'))
  const onXLSX = () => (MODE === 'mock' ? exportXLSX() : downloadHistorical('xlsx'))

  return (
    <div className="flex flex-col gap-2">

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">

        {/* ── Configuración ─────────────────────────────── */}
        <Card className="p-4 flex flex-col gap-2 xl:col-span-1">

          {/* Rango de fechas */}
          <div>
            <p className="text-xs font-bold tracking-widest uppercase mb-2">Rango de tiempo</p>
            <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="Atajos de período">
              {atajos.map(a => (
                <button key={a.label} type="button" onClick={a.fn}
                  className="border border-border bg-background px-2 min-h-[28px] text-[11px] font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent">{a.label}</button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Desde</label>
                <input
                  type="datetime-local"
                  value={fromVal}
                  onChange={e => setFromVal(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-2 min-h-[30px] text-xs font-mono text-foreground"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input
                  type="datetime-local"
                  value={toVal}
                  onChange={e => setToVal(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-2 min-h-[30px] text-xs font-mono text-foreground"
                />
              </div>
            </div>
            {bufStart && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Buffer disponible: {fmtFull(bufStart)} – {fmtFull(bufEnd!)}
              </p>
            )}
          </div>

          {/* Tipos de equipo */}
          <div>
            <p className="text-xs font-bold tracking-widest uppercase mb-2">Equipos</p>
            <div className="flex flex-col gap-1">
              {([
                ['bombas', 'Bombas', true],
                ['medidores', 'Medidores', true],
                ['caudal', 'Caudalímetros', hasCaudales],
                ['campo', 'Campo', hasCampo],
              ] as [Tipo, string, boolean][]).filter(t => t[2]).map(([t, label]) => (
                <label key={t} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={selTipos.has(t)} onCheckedChange={() => toggleTipo(t)} aria-label={label} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Resolución */}
          <div>
            <p className="text-xs font-bold tracking-widest uppercase mb-2">Resolución</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Resolución">
              {RESOLUCIONES.map(r => (
                <button key={r.v} type="button" aria-pressed={resolucion === r.v}
                  onClick={() => { setResol(r.v); setResolManual(true) }}
                  className={cn(
                    'border px-2 min-h-[28px] text-[11px] font-semibold tracking-wider',
                    resolucion === r.v
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}>{r.label}</button>
              ))}
            </div>
          </div>

          {/* Selección de drives */}
          <div className={cn(!selTipos.has('bombas') && 'opacity-50')}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold tracking-widest uppercase">Bombas</p>
              <button type="button" onClick={() => setSelDrives(new Set())} disabled={selDrives.size === 0 || !selTipos.has('bombas')}
                className="border border-border bg-background px-2 min-h-[24px] text-[10px] font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">TODAS</button>
            </div>
            <div className="flex flex-col gap-1">
              {driveList.map(d => (
                <label key={d.name} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={selDrives.size === 0 || selDrives.has(d.name)}
                    onCheckedChange={() => toggleDrive(d.name)}
                    disabled={!selTipos.has('bombas')}
                  />
                  {d.displayName ?? d.name}
                  <span className="text-[10px] text-muted-foreground">{d.type}</span>
                </label>
              ))}
              {driveList.length === 0 && <p className="text-xs text-muted-foreground">Sin bombas</p>}
            </div>
          </div>

          {/* Secciones */}
          <div className={cn(!selTipos.has('bombas') && 'opacity-50')}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2">Datos a incluir</p>
            <div className="flex flex-col gap-1">
              {(Object.keys(SECTION_LABELS) as Section[]).map(s => (
                <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={selSections.has(s)}
                    onCheckedChange={() => toggleSection(s)}
                    disabled={!selTipos.has('bombas')}
                  />
                  {SECTION_LABELS[s]}
                </label>
              ))}
            </div>
          </div>

          {/* Warning */}
          {outOfRange && (
            <p className="text-xs text-muted-foreground">
              ⚠ El rango seleccionado está fuera del buffer en memoria. Solo se exportará lo disponible.
            </p>
          )}
          {noData && !outOfRange && (
            <p className="text-xs text-muted-foreground">
              Sin datos en el rango seleccionado.
            </p>
          )}

          {/* Resumen (energía + prom/mín/máx) en el XLSX */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={includeSummary} onCheckedChange={setIncludeSummary} />
            Incluir hoja de resumen (energía kWh + prom/mín/máx)
          </label>

          {/* Botones */}
          <div className="grid grid-cols-3 gap-2 mt-auto pt-2">
            {([
              ['csv', onCSV, 'CSV', FileSpreadsheet, 'outline'],
              ['xlsx', onXLSX, 'XLSX', SheetIcon, 'outline'],
              ['pdf', onPDF, 'PDF', Download, 'default'],
            ] as const).map(([k, fn, label, Icon, variant]) => (
              <Button key={k} variant={variant} onClick={fn} disabled={downloading !== null || selTipos.size === 0}>
                {downloading === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </Button>
            ))}
          </div>
          {MODE !== 'mock' && (
            <p className="text-[10px] text-muted-foreground -mt-1">
              Los reportes usan el histórico completo (InfluxDB). La vista previa muestra los últimos ~3 min en vivo.
            </p>
          )}
        </Card>

        {/* ── Vista previa ───────────────────────────────── */}
        <Card className="p-4 xl:col-span-2">
          <p className="text-xs font-bold tracking-widest uppercase mb-3">Vista previa</p>

          <div className="overflow-auto max-h-[500px] flex flex-col gap-2 text-xs">

            {secOn('current') && (
              <PreviewTable
                title="Corriente por Bomba (A)"
                drives={activeDrives}
                field="current"
                getHistory={getDriveHistory}
                fmt={(v) => loc(v, 2)}
              />
            )}

            {secOn('power') && (
              <PreviewTable
                title="Potencia por Bomba (kW)"
                drives={activeDrives}
                field="power"
                getHistory={getDriveHistory}
                fmt={(v) => loc(v, 2)}
              />
            )}

            {secOn('temps') && activeDrives.some(d => d.type === 'CFW900') && (
              <PreviewTable
                title="Temp. IGBT — CFW900 (°C)"
                drives={activeDrives.filter(d => d.type === 'CFW900')}
                field="igbtTemp"
                getHistory={getDriveHistory}
                fmt={(v) => loc(v, 1)}
              />
            )}

            {secOn('temps') && activeDrives.some(d => d.type === 'SSW900') && (
              <PreviewTable
                title="Temp. SCR — SSW900 (°C)"
                drives={activeDrives.filter(d => d.type === 'SSW900')}
                field="scrTemp"
                getHistory={getDriveHistory}
                fmt={(v) => loc(v, 1)}
              />
            )}

            {selTipos.has('medidores') && meterList.map(m => {
              const pts = getMeterHistory(m.name)
              return (
                <div key={m.name}>
                  <p className="font-semibold mb-1">Medidor — {meterDisplayName(m.name)}</p>
                  {pts.length === 0
                    ? <p className="text-muted-foreground">Sin datos</p>
                    : (
                      <table className="w-full border-collapse text-[10px]">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1 pr-3">Timestamp</th>
                            <th className="text-right py-1 px-2">I (A)</th>
                            <th className="text-right py-1 px-2">P (kW)</th>
                            <th className="text-right py-1 px-2">FP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pts.slice(-50).map(p => (
                            <tr key={p.ts} className="border-b border-border/40">
                              <td className="py-0.5 pr-3 text-muted-foreground">{fmtFull(p.ts)}</td>
                              <td className="text-right px-2">{loc(p.current ?? 0, 2)}</td>
                              <td className="text-right px-2">{loc(p.power ?? 0, 2)}</td>
                              <td className="text-right px-2">{loc(p.pf ?? 0, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }
                </div>
              )
            })}

            {noData && (
              <p className="text-muted-foreground text-center py-8">Sin datos en el rango seleccionado.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── PreviewTable helper component ───────────────────────────────────────────

import type { Drive } from '../types'

interface PreviewTableProps {
  title: string
  drives: Drive[]
  field: keyof HistoryPoint
  getHistory: (name: string) => HistoryPoint[]
  fmt: (v: number) => string
}

function PreviewTable({ title, drives, field, getHistory, fmt }: PreviewTableProps) {
  // Mismo merge por cercania de timestamp que la exportacion
  const series: Record<string, HistoryPoint[]> = {}
  for (const d of drives) series[d.name] = getHistory(d.name)
  const merged = mergeByTimestamp(series)

  return (
    <div>
      <p className="font-semibold mb-1">{title}</p>
      {merged.length === 0
        ? <p className="text-muted-foreground">Sin datos</p>
        : (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 pr-3">Timestamp</th>
                {drives.map(d => (
                  <th key={d.name} className="text-right py-1 px-2">{d.displayName ?? d.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {merged.slice(-50).map(({ ts, points }) => (
                <tr key={ts} className="border-b border-border/40">
                  <td className="py-0.5 pr-3 text-muted-foreground">{fmtFull(ts)}</td>
                  {drives.map(d => {
                    const val = points[d.name]?.[field]
                    return (
                      <td key={d.name} className="text-right px-2">
                        {val != null ? fmt(val as number) : '-'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </div>
  )
}
