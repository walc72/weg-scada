/**
 * Alarmas — activas e historial (inicio/fin/duración) desde InfluxDB.
 *
 * GET /api/alarms?from=&to=&device= devuelve los intervalos que se solapan con
 * el rango (end null = sigue activa). Las activas se refrescan cada 10 s.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { Chip } from '../components/CampoBase'
import { apiJson } from '@/lib/api'
import { useDrivesStore, selectDriveList } from '../store/drives'
import { useConfigStore } from '../store/config'
import VerEnUnifilar from '../components/unifilar/VerEnUnifilar'

interface Alarm { device: string; type: string; text: string; start: number; end: number | null }

const TYPE_LABEL: Record<string, string> = {
  FALLA: 'Falla',
  DISPARO: 'Disparo',
  BLOQUEO: 'Bloqueado',
  ALARMA_EQUIPO: 'Alarma del equipo',
  CORRIENTE_ALTA: 'Corriente alta',
  TEMP_ALTA: 'Temperatura alta',
  ERRORES_COMM: 'Errores de comunicación',
  SIN_COMUNICACION: 'Sin comunicación',
}
// ALARMA_<n>: punto de alarma de reconectador/regulador
const tipoLabel = (t: string) => TYPE_LABEL[t] || (t.startsWith('ALARMA_') ? 'Alarma del equipo' : t)
// Prioridad ISA-101, igual que la barra superior: P1 falla/disparo, P2 sin comunicación/bloqueo, P3 el resto
type Prio = 'p1' | 'p2' | 'p3'
const prio = (t: string): Prio =>
  t === 'FALLA' || t === 'DISPARO' ? 'p1' : t === 'SIN_COMUNICACION' || t === 'ERRORES_COMM' || t === 'BLOQUEO' ? 'p2' : 'p3'
const ORDEN: Record<Prio, number> = { p1: 0, p2: 1, p3: 2 }

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
// Demo sin backend: unas alarmas de muestra para ver la pantalla
const demo = (): Alarm[] => {
  const t = Date.now(), m = 60_000
  return [
    { device: 'SAER 3', type: 'FALLA', text: 'Falla F070 — sobrecorriente', start: t - 4 * m, end: null },
    { device: 'SAER 8', type: 'SIN_COMUNICACION', text: 'Sin respuesta Modbus', start: t - 38 * m, end: null },
    { device: 'SAER 2', type: 'TEMP_ALTA', text: 'Temperatura 71 °C', start: t - 12 * m, end: null },
    { device: 'SAER 1', type: 'CORRIENTE_ALTA', text: 'Corriente 612 A', start: t - 26 * 60 * m, end: t - 25 * 60 * m },
    { device: 'Reco Agrocaraya', type: 'DISPARO', text: 'Disparo por sobrecorriente fase B', start: t - 50 * 60 * m, end: t - 49 * 60 * m },
  ]
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTs = (ms: number) => new Date(ms).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

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
  const cfg = useConfigStore(s => s.config)
  const equipos = useMemo(() => [
    ...driveList.map(d => ({ name: d.name, label: d.displayName || d.name })),
    ...[...(cfg?.reconectadores || []), ...(cfg?.reguladores || [])].map(c => ({ name: c.name, label: c.name })),
  ], [driveList, cfg])
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
      if (MODE === 'mock') { setHistory(demo().filter(a => !device || a.device === device)); setTruncated(false); return }
      const r = await apiJson<{ alarms: Alarm[]; truncated: boolean }>(`/alarms?${q}`)
      setHistory(r.alarms); setTruncated(r.truncated)
    } catch (e) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }, [from, to, device])

  const loadActive = useCallback(async () => {
    try {
      const r = MODE === 'mock' ? { alarms: demo() } : await apiJson<{ alarms: Alarm[] }>(`/alarms?from=${Date.now()}`)
      setActive(r.alarms.filter(a => a.end === null).sort((a, b) => ORDEN[prio(a.type)] - ORDEN[prio(b.type)] || b.start - a.start)); setNow(Date.now())
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
      label(a.device), tipoLabel(a.type), a.text,
    ]),
  ])

  const cuenta = (p: Prio) => active.filter(a => prio(a.type) === p).length
  const ctrl = 'border border-border bg-background px-2 min-h-[30px] text-xs text-foreground'
  const th = 'text-left font-medium px-3 py-2 border-b'

  return (
    <div className="flex flex-col gap-4">
      {/* Activas: ordenadas por prioridad; la franja de color a la izquierda es la prioridad */}
      <section aria-labelledby="t-act" className="bg-card border">
        <header className="flex items-center gap-2 px-3 py-2 border-b">
          <h1 id="t-act" className="text-xs font-bold tracking-widest mr-auto">ALARMAS ACTIVAS</h1>
          {(['p1', 'p2', 'p3'] as const).map(p => {
            const n = cuenta(p)
            return n > 0
              ? <Chip key={p} tono={p} blink={p === 'p1'}>{p.toUpperCase()} {n}</Chip>
              : <Chip key={p} tono="off">{p.toUpperCase()} 0</Chip>
          })}
        </header>
        {active.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">Sin alarmas activas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="text-[11px] tracking-wider text-muted-foreground">
                  <th scope="col" className={th}>PRIORIDAD</th><th scope="col" className={th}>EQUIPO</th><th scope="col" className={th}>EVENTO</th>
                  <th scope="col" className={th}>DETALLE</th><th scope="col" className={th}>DESDE</th><th scope="col" className={th}>DURACIÓN</th>
                </tr>
              </thead>
              <tbody>
                {active.map(a => {
                  const p = prio(a.type)
                  return (
                    <tr key={`${a.device}|${a.type}`} className="border-b border-border/60" style={{ boxShadow: `inset 4px 0 0 var(--${p})` }}>
                      <td className="px-3 py-2"><Chip tono={p} blink={p === 'p1'}>{p.toUpperCase()}</Chip></td>
                      <td className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1">{label(a.device)}<VerEnUnifilar equipo={a.device} /></span></td>
                      <td className="px-3 py-2 font-semibold tracking-wide uppercase">{tipoLabel(a.type)}</td>
                      <td className="px-3 py-2">{a.text}</td>
                      <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-muted-foreground">{fmtTs(a.start)}</td>
                      <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">{fmtDur(now - a.start)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="t-hist" className="bg-card border">
        <header className="flex items-center gap-2 flex-wrap px-3 py-2 border-b">
          <h2 id="t-hist" className="text-xs font-bold tracking-widest mr-auto">HISTORIAL</h2>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">DESDE
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className={ctrl} />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">HASTA
            <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className={ctrl} />
          </label>
          <select value={device} onChange={e => setDevice(e.target.value)} className={ctrl} aria-label="Equipo">
            <option value="">Todos los equipos</option>
            {equipos.map(d => <option key={d.name} value={d.name}>{d.label}</option>)}
          </select>
          <button onClick={loadHistory} title="Actualizar" aria-label="Actualizar" className={`${ctrl} inline-flex items-center hover:bg-accent`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button onClick={exportCsv} disabled={!history.length} className={`${ctrl} inline-flex items-center gap-1 font-semibold tracking-wider hover:bg-accent disabled:opacity-50`}>
            <Download className="h-3.5 w-3.5" />CSV
          </button>
        </header>

        {error && <div className="px-3 pt-3 text-sm" style={{ color: 'var(--p1-text)' }}>Error al cargar el historial: {error}</div>}
        {truncated && <div className="px-3 pt-3 text-xs text-muted-foreground">Se muestran las 5000 más recientes; acotá el rango para ver el resto.</div>}

        {!error && !loading && history.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">Sin alarmas en el rango.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead>
                <tr className="text-[11px] tracking-wider text-muted-foreground">
                  <th scope="col" className={th}>PRIO</th><th scope="col" className={th}>INICIO</th><th scope="col" className={th}>FIN</th><th scope="col" className={th}>DURACIÓN</th>
                  <th scope="col" className={th}>EQUIPO</th><th scope="col" className={th}>EVENTO</th><th scope="col" className={th}>DETALLE</th>
                </tr>
              </thead>
              <tbody>
                {history.map(a => {
                  const p = prio(a.type)
                  return (
                    <tr key={`${a.device}|${a.type}|${a.start}`} className="border-b border-border/60 hover:bg-accent/40">
                      <td className="px-3 py-1.5"><span className="text-[11px] font-bold tracking-wider" style={{ color: `var(--${p}-text)` }}>{p.toUpperCase()}</span></td>
                      <td className="px-3 py-1.5 font-mono tabular-nums whitespace-nowrap text-muted-foreground">{fmtTs(a.start)}</td>
                      <td className="px-3 py-1.5 font-mono tabular-nums whitespace-nowrap">{a.end ? <span className="text-muted-foreground">{fmtTs(a.end)}</span> : <span className="font-bold" style={{ color: 'var(--p1-text)' }}>ACTIVA</span>}</td>
                      <td className="px-3 py-1.5 font-mono tabular-nums whitespace-nowrap">{fmtDur((a.end ?? now) - a.start)}</td>
                      <td className="px-3 py-1.5 font-semibold"><span className="inline-flex items-center gap-1">{label(a.device)}<VerEnUnifilar equipo={a.device} /></span></td>
                      <td className="px-3 py-1.5 uppercase tracking-wide text-[12px]">{tipoLabel(a.type)}</td>
                      <td className="px-3 py-1.5">{a.text}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
