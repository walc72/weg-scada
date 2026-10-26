/**
 * Alarmas — activas e historial (inicio/fin/duración) desde InfluxDB.
 *
 * GET /api/alarms?from=&to=&device= devuelve los intervalos que se solapan con
 * el rango (end null = sigue activa). Las activas se refrescan cada 10 s.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { apiJson } from '@/lib/api'
import { useDrivesStore, selectDriveList } from '../store/drives'

interface Alarm { device: string; type: string; text: string; start: number; end: number | null }

const TYPE_LABEL: Record<string, string> = {
  FALLA: 'Falla',
  ALARMA_EQUIPO: 'Alarma del equipo',
  CORRIENTE_ALTA: 'Corriente alta',
  TEMP_ALTA: 'Temperatura alta',
  ERRORES_COMM: 'Errores de comunicación',
  SIN_COMUNICACION: 'Sin comunicación',
}
const isFault = (t: string) => t === 'FALLA'

const pad = (n: number) => String(n).padStart(2, '0')
const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTs = (ms: number) => new Date(ms).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'medium' })

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60
  if (d) return `${d} d ${h} h`
  if (h) return `${h} h ${m} min`
  if (m) return `${m} min ${s % 60} s`
  return `${s} s`
}

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function downloadCSV(filename: string, rows: string[][]) {
  const content = rows.map(r => r.map(csvField).join(',')).join('\n')
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function Alarmas() {
  const drives = useDrivesStore(s => s.drives)
  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const label = useCallback((name: string) => drives.get(name)?.displayName || name, [drives])

  const today = dayStr(new Date())
  const [from, setFrom] = useState(dayStr(new Date(Date.now() - 7 * 86400000)))
  const [to, setTo] = useState(today)
  const [device, setDevice] = useState('')
  const [history, setHistory] = useState<Alarm[]>([])
  const [truncated, setTruncated] = useState(false)
  const [active, setActive] = useState<Alarm[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const loadHistory = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const q = new URLSearchParams({
        from: String(new Date(`${from}T00:00:00`).getTime()),
        to: String(new Date(`${to}T23:59:59.999`).getTime()),
      })
      if (device) q.set('device', device)
      const r = await apiJson<{ alarms: Alarm[]; truncated: boolean }>(`/alarms?${q}`)
      setHistory(r.alarms); setTruncated(r.truncated)
    } catch (e) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }, [from, to, device])

  const loadActive = useCallback(async () => {
    try {
      const r = await apiJson<{ alarms: Alarm[] }>(`/alarms?from=${Date.now()}`)
      setActive(r.alarms.filter(a => a.end === null)); setNow(Date.now())
    } catch { /* el error ya se muestra con el historial */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => {
    loadActive()
    const id = setInterval(loadActive, 10000)
    return () => clearInterval(id)
  }, [loadActive])

  const exportCsv = () => downloadCSV(`alarmas_${from}_${to}.csv`, [
    ['Inicio', 'Fin', 'Duración', 'Equipo', 'Tipo', 'Detalle'],
    ...history.map(a => [
      fmtTs(a.start), a.end ? fmtTs(a.end) : 'Activa', fmtDur((a.end ?? now) - a.start),
      label(a.device), TYPE_LABEL[a.type] || a.type, a.text,
    ]),
  ])

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <span className="font-bold text-base">Alarmas activas</span>
          <span className="text-xs text-muted-foreground">({active.length})</span>
        </div>
        {active.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin alarmas activas.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Equipo</TableHead><TableHead>Tipo</TableHead><TableHead>Detalle</TableHead><TableHead>Desde</TableHead><TableHead>Duración</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {active.map(a => (
                <TableRow key={`${a.device}|${a.type}`}>
                  <TableCell className="font-medium">{label(a.device)}</TableCell>
                  <TableCell><Badge variant={isFault(a.type) ? 'destructive' : 'warning'} className="text-[10px] py-0">{TYPE_LABEL[a.type] || a.type}</Badge></TableCell>
                  <TableCell>{a.text}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{fmtTs(a.start)}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{fmtDur(now - a.start)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="font-bold text-base mr-auto">Historial</span>
          <label className="text-xs text-muted-foreground">Desde</label>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground" />
          <label className="text-xs text-muted-foreground">Hasta</label>
          <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground" />
          <select value={device} onChange={e => setDevice(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground">
            <option value="">Todos los equipos</option>
            {driveList.map(d => <option key={d.name} value={d.name}>{d.displayName || d.name}</option>)}
          </select>
          <button onClick={loadHistory} title="Actualizar" className="text-muted-foreground hover:text-foreground">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button onClick={exportCsv} disabled={!history.length} title="Exportar CSV"
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />CSV
          </button>
        </div>

        {error && <div className="text-sm text-destructive mb-2">Error al cargar el historial: {error}</div>}
        {truncated && <div className="text-xs text-muted-foreground mb-2">Se muestran las 5000 más recientes; acotá el rango para ver el resto.</div>}

        {!error && !loading && history.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin alarmas en el rango.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Inicio</TableHead><TableHead>Fin</TableHead><TableHead>Duración</TableHead><TableHead>Equipo</TableHead><TableHead>Tipo</TableHead><TableHead>Detalle</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {history.map(a => (
                <TableRow key={`${a.device}|${a.type}|${a.start}`}>
                  <TableCell className="tabular-nums whitespace-nowrap">{fmtTs(a.start)}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{a.end ? fmtTs(a.end) : <Badge variant="warning" className="text-[10px] py-0">Activa</Badge>}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{fmtDur((a.end ?? now) - a.start)}</TableCell>
                  <TableCell className="font-medium">{label(a.device)}</TableCell>
                  <TableCell>{TYPE_LABEL[a.type] || a.type}</TableCell>
                  <TableCell>{a.text}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
