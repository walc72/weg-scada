import { useMemo, useState } from 'react'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import type { HistoryPoint, MeterPoint } from '../store/drives'
import { FileText, Download, FileSpreadsheet, Wifi, WifiOff } from 'lucide-react'
import { Card } from '../components/ui/card'
import { cn } from '@/lib/utils'

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

function downloadCSV(filename: string, rows: string[][]) {
  const content = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

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
  const th = headers.map(h => `<th>${h}</th>`).join('')
  const trs = rows.map(r =>
    `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`
  ).join('')
  return `
    <h3>${title}</h3>
    <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
  `
}

// ─── SECTION configs ─────────────────────────────────────────────────────────

type Section = 'current' | 'power' | 'temps' | 'pm8000'

const SECTION_LABELS: Record<Section, string> = {
  current: 'Corriente por Drive (A)',
  power:   'Potencia por Drive (kW)',
  temps:   'Temperaturas (°C)',
  pm8000:  'Línea General PM8000',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Reportes() {
  const drives       = useDrivesStore(s => s.drives)
  const meters       = useDrivesStore(s => s.meters)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const meterHistory = useDrivesStore(s => s.meterHistory)
  const connected    = useDrivesStore(s => s.connected)

  const driveList  = useMemo(() => selectDriveList(drives),  [drives])
  const meterList  = useMemo(() => selectMeterList(meters),  [meters])
  const meterNames = useConfigStore(s => s.config?.meterNames) ?? {}

  function meterDisplayName(name: string) { return meterNames[name] || name }

  const now = Date.now()
  const [fromVal, setFromVal] = useState(toInputVal(now - 30 * 60_000))
  const [toVal,   setToVal]   = useState(toInputVal(now + 24 * 60 * 60_000))

  const [selDrives,   setSelDrives]   = useState<Set<string>>(new Set())
  const [selSections, setSelSections] = useState<Set<Section>>(new Set(['current', 'power', 'temps', 'pm8000']))

  // selected drives defaults to all when nothing explicitly chosen
  const activeDrives = selDrives.size > 0
    ? driveList.filter(d => selDrives.has(d.name))
    : driveList

  function toggleDrive(name: string) {
    setSelDrives(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function toggleSection(s: Section) {
    setSelSections(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  // ── filtered history in selected range ──────────────────────────────────
  const since = new Date(fromVal).getTime()
  const until = new Date(toVal).getTime()

  function getDriveHistory(name: string): HistoryPoint[] {
    return (driveHistory.get(name) ?? []).filter(p => p.ts >= since && p.ts <= until)
  }

  function getMeterHistory(name: string): MeterPoint[] {
    return (meterHistory.get(name) ?? []).filter(p => p.ts >= since && p.ts <= until)
  }
  const filteredMeter: MeterPoint[] = getMeterHistory('PM8000')

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
  const noData     = activeDrives.every(d => getDriveHistory(d.name).length === 0) && filteredMeter.length === 0

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')

    if (selSections.has('current')) {
      const names = activeDrives.map(d => d.name)
      const allTs = [...new Set(names.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
      const rows: string[][] = [['Timestamp', ...names]]
      for (const t of allTs) {
        const row: string[] = [fmtFull(t)]
        for (const n of names) {
          const p = getDriveHistory(n).find(x => x.ts === t)
          row.push(p ? p.current.toFixed(2) : '')
        }
        rows.push(row)
      }
      downloadCSV(`corriente_${ts}.csv`, rows)
    }

    if (selSections.has('power')) {
      const names = activeDrives.map(d => d.name)
      const allTs = [...new Set(names.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
      const rows: string[][] = [['Timestamp', ...names]]
      for (const t of allTs) {
        const row: string[] = [fmtFull(t)]
        for (const n of names) {
          const p = getDriveHistory(n).find(x => x.ts === t)
          row.push(p ? p.power.toFixed(2) : '')
        }
        rows.push(row)
      }
      downloadCSV(`potencia_${ts}.csv`, rows)
    }

    if (selSections.has('temps')) {
      const cfwDrives = activeDrives.filter(d => d.type === 'CFW900')
      const sswDrives = activeDrives.filter(d => d.type === 'SSW900')
      if (cfwDrives.length > 0) {
        const names = cfwDrives.map(d => d.name)
        const allTs = [...new Set(names.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
        const rows: string[][] = [['Timestamp', ...names.map(n => `${n} IGBT°C`)]]
        for (const t of allTs) {
          const row: string[] = [fmtFull(t)]
          for (const n of names) {
            const p = getDriveHistory(n).find(x => x.ts === t)
            row.push(p ? p.igbtTemp.toFixed(1) : '')
          }
          rows.push(row)
        }
        downloadCSV(`temp_igbt_${ts}.csv`, rows)
      }
      if (sswDrives.length > 0) {
        const names = sswDrives.map(d => d.name)
        const allTs = [...new Set(names.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
        const rows: string[][] = [['Timestamp', ...names.map(n => `${n} SCR°C`)]]
        for (const t of allTs) {
          const row: string[] = [fmtFull(t)]
          for (const n of names) {
            const p = getDriveHistory(n).find(x => x.ts === t)
            row.push(p ? p.scrTemp.toFixed(1) : '')
          }
          rows.push(row)
        }
        downloadCSV(`temp_scr_${ts}.csv`, rows)
      }
    }

    if (selSections.has('pm8000')) {
      for (const m of meterList) {
        const pts = getMeterHistory(m.name)
        if (pts.length === 0) continue
        const rows: string[][] = [['Timestamp', 'Corriente (A)', 'Potencia (kW)', 'Factor de Potencia']]
        for (const p of pts) {
          rows.push([fmtFull(p.ts), p.current.toFixed(2), p.power.toFixed(2), p.pf.toFixed(3)])
        }
        const slug = m.name.replace(/\s+/g, '_').toLowerCase()
        downloadCSV(`${slug}_${ts}.csv`, rows)
      }
    }
  }

  // ── PDF export ─────────────────────────────────────────────────────────────
  function exportPDF() {
    let body = ''

    if (selSections.has('current')) {
      const names = activeDrives.map(d => d.displayName ?? d.name)
      const keys  = activeDrives.map(d => d.name)
      const allTs = [...new Set(keys.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
      const rows  = allTs.map(t => {
        const row: (string|number)[] = [fmtFull(t)]
        for (const n of keys) {
          const p = getDriveHistory(n).find(x => x.ts === t)
          row.push(p ? p.current.toFixed(2) : '-')
        }
        return row
      })
      body += buildTableHTML('Corriente por Drive (A)', ['Timestamp', ...names], rows)
    }

    if (selSections.has('power')) {
      const names = activeDrives.map(d => d.displayName ?? d.name)
      const keys  = activeDrives.map(d => d.name)
      const allTs = [...new Set(keys.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
      const rows  = allTs.map(t => {
        const row: (string|number)[] = [fmtFull(t)]
        for (const n of keys) {
          const p = getDriveHistory(n).find(x => x.ts === t)
          row.push(p ? p.power.toFixed(2) : '-')
        }
        return row
      })
      body += buildTableHTML('Potencia por Drive (kW)', ['Timestamp', ...names], rows)
    }

    if (selSections.has('temps')) {
      const cfwDrives = activeDrives.filter(d => d.type === 'CFW900')
      const sswDrives = activeDrives.filter(d => d.type === 'SSW900')
      if (cfwDrives.length > 0) {
        const names = cfwDrives.map(d => d.displayName ?? d.name)
        const keys  = cfwDrives.map(d => d.name)
        const allTs = [...new Set(keys.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
        const rows  = allTs.map(t => {
          const row: (string|number)[] = [fmtFull(t)]
          for (const n of keys) {
            const p = getDriveHistory(n).find(x => x.ts === t)
            row.push(p ? p.igbtTemp.toFixed(1) : '-')
          }
          return row
        })
        body += buildTableHTML('Temperatura IGBT — CFW900 (°C)', ['Timestamp', ...names], rows)
      }
      if (sswDrives.length > 0) {
        const names = sswDrives.map(d => d.displayName ?? d.name)
        const keys  = sswDrives.map(d => d.name)
        const allTs = [...new Set(keys.flatMap(n => getDriveHistory(n).map(p => p.ts)))].sort()
        const rows  = allTs.map(t => {
          const row: (string|number)[] = [fmtFull(t)]
          for (const n of keys) {
            const p = getDriveHistory(n).find(x => x.ts === t)
            row.push(p ? p.scrTemp.toFixed(1) : '-')
          }
          return row
        })
        body += buildTableHTML('Temperatura SCR — SSW900 (°C)', ['Timestamp', ...names], rows)
      }
    }

    if (selSections.has('pm8000')) {
      for (const m of meterList) {
        const pts = getMeterHistory(m.name)
        if (pts.length === 0) continue
        const rows = pts.map(p => [fmtFull(p.ts), p.current.toFixed(2), p.power.toFixed(2), p.pf.toFixed(3)])
        body += buildTableHTML(`Medidor — ${meterDisplayName(m.name)}`, ['Timestamp', 'Corriente (A)', 'Potencia (kW)', 'FP'], rows)
      }
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Reporte de Drives</title>
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
<h1>Reporte — Monitoreo de Drives</h1>
<h2>Generado: ${fmtFull(Date.now())} &nbsp;|&nbsp; Rango: ${fmtFull(since)} – ${fmtFull(until)}</h2>
${body || '<p>Sin datos en el rango seleccionado.</p>'}
<p style="margin-top:24px; font-size:9px; color:#888;">Powered by Tecno Electric S.A.</p>
</body></html>`

    openPrintWindow(html)
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Reportes</h2>
        <div className="ml-auto">
          {connected
            ? <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400"><Wifi className="h-3.5 w-3.5" />CONECTADO</span>
            : <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><WifiOff className="h-3.5 w-3.5" />SIN CONEXIÓN</span>
          }
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* ── Configuración ─────────────────────────────── */}
        <Card className="p-4 flex flex-col gap-4 xl:col-span-1">

          {/* Rango de fechas */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Rango de tiempo</p>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Desde</label>
                <input
                  type="datetime-local"
                  value={fromVal}
                  onChange={e => setFromVal(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input
                  type="datetime-local"
                  value={toVal}
                  onChange={e => setToVal(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                />
              </div>
            </div>
            {bufStart && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Buffer disponible: {fmtFull(bufStart)} – {fmtFull(bufEnd!)}
              </p>
            )}
          </div>

          {/* Selección de drives */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Drives</p>
            <div className="flex flex-col gap-1">
              {driveList.map(d => (
                <label key={d.name} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selDrives.size === 0 || selDrives.has(d.name)}
                    onChange={() => toggleDrive(d.name)}
                    className="rounded"
                  />
                  {d.displayName ?? d.name}
                  <span className="text-[10px] text-muted-foreground">{d.type}</span>
                </label>
              ))}
              {driveList.length === 0 && <p className="text-xs text-muted-foreground">Sin drives</p>}
            </div>
          </div>

          {/* Secciones */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Datos a incluir</p>
            <div className="flex flex-col gap-1">
              {(Object.keys(SECTION_LABELS) as Section[]).map(s => (
                <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selSections.has(s)}
                    onChange={() => toggleSection(s)}
                    className="rounded"
                  />
                  {SECTION_LABELS[s]}
                </label>
              ))}
            </div>
          </div>

          {/* Warning */}
          {outOfRange && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              ⚠ El rango seleccionado está fuera del buffer en memoria. Solo se exportará lo disponible.
            </p>
          )}
          {noData && !outOfRange && (
            <p className="text-xs text-muted-foreground">
              Sin datos en el rango seleccionado.
            </p>
          )}

          {/* Botones */}
          <div className="flex gap-2 mt-auto pt-2">
            <button
              onClick={exportCSV}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                'bg-green-600 hover:bg-green-700 text-white'
              )}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              onClick={exportPDF}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                'bg-primary hover:opacity-90 text-primary-foreground'
              )}
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        </Card>

        {/* ── Vista previa ───────────────────────────────── */}
        <Card className="p-4 xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Vista previa</p>

          <div className="overflow-auto max-h-[500px] flex flex-col gap-4 text-xs">

            {selSections.has('current') && (
              <PreviewTable
                title="Corriente por Drive (A)"
                drives={activeDrives}
                field="current"
                getHistory={getDriveHistory}
                fmt={(v) => v.toFixed(2)}
              />
            )}

            {selSections.has('power') && (
              <PreviewTable
                title="Potencia por Drive (kW)"
                drives={activeDrives}
                field="power"
                getHistory={getDriveHistory}
                fmt={(v) => v.toFixed(2)}
              />
            )}

            {selSections.has('temps') && activeDrives.some(d => d.type === 'CFW900') && (
              <PreviewTable
                title="Temp. IGBT — CFW900 (°C)"
                drives={activeDrives.filter(d => d.type === 'CFW900')}
                field="igbtTemp"
                getHistory={getDriveHistory}
                fmt={(v) => v.toFixed(1)}
              />
            )}

            {selSections.has('temps') && activeDrives.some(d => d.type === 'SSW900') && (
              <PreviewTable
                title="Temp. SCR — SSW900 (°C)"
                drives={activeDrives.filter(d => d.type === 'SSW900')}
                field="scrTemp"
                getHistory={getDriveHistory}
                fmt={(v) => v.toFixed(1)}
              />
            )}

            {selSections.has('pm8000') && meterList.map(m => {
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
                              <td className="text-right px-2">{p.current.toFixed(2)}</td>
                              <td className="text-right px-2">{p.power.toFixed(2)}</td>
                              <td className="text-right px-2">{p.pf.toFixed(3)}</td>
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
  const allTs = [...new Set(drives.flatMap(d => getHistory(d.name).map(p => p.ts)))].sort()

  return (
    <div>
      <p className="font-semibold mb-1">{title}</p>
      {allTs.length === 0
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
              {allTs.slice(-50).map(t => (
                <tr key={t} className="border-b border-border/40">
                  <td className="py-0.5 pr-3 text-muted-foreground">{fmtFull(t)}</td>
                  {drives.map(d => {
                    const p = getHistory(d.name).find(x => x.ts === t)
                    return (
                      <td key={d.name} className="text-right px-2">
                        {p != null ? fmt(p[field] as number) : '-'}
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
