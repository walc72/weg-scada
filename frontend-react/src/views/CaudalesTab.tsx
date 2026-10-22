// Tendencias → Caudales (módulo caudales, spec §4.2): caudal por bomba y por
// colector, y bombas en marcha como áreas apiladas con la línea de Total.
import { useMemo } from 'react'
import TrendChart, { SeriesDef } from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { useDrivesStore } from '../store/drives'
import { colectorLabel } from '@/lib/flow'

type Row = { _time: string; name: string; [k: string]: number | string }
export type SeriesResp = { drives: Row[]; flows?: Row[] }
type Pt = { ts: number; key: string; flow: number; running?: number }

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16']
const FM = 'fm:'  // prefijo de las series de colectores (no chocan con nombres de bombas)
const round = (ts: number) => Math.round(ts / 2000) * 2000

function fromResp(d: SeriesResp): Pt[] {
  const out: Pt[] = []
  for (const r of d.drives || []) if (typeof r.flow === 'number') out.push({ ts: new Date(r._time).getTime(), key: r.name, flow: r.flow })
  for (const r of d.flows || []) if (typeof r.flow === 'number') out.push({ ts: new Date(r._time).getTime(), key: FM + r.name, flow: r.flow })
  return out
}

// stacked: huecos en 0, bomba parada en 0 (si se conoce running) y Total
function toChart(pts: Pt[], keys: string[], stacked: boolean): Record<string, number>[] {
  const want = new Set(keys)
  const byTs = new Map<number, Record<string, number>>()
  for (const p of pts) {
    if (!want.has(p.key)) continue
    const t = round(p.ts)
    let o = byTs.get(t)
    if (!o) { o = { ts: t }; byTs.set(t, o) }
    o[p.key] = stacked && p.running === 0 ? 0 : p.flow
  }
  const rows = [...byTs.values()].sort((a, b) => a.ts - b.ts)
  if (stacked) for (const o of rows) {
    let total = 0
    for (const k of keys) { o[k] = o[k] ?? 0; total += o[k] }
    o.total = total
  }
  return rows
}

export default function CaudalesTab({ data, since, until, fetchRange }: {
  data: SeriesResp | null   // null = buffer en RAM (modo demo)
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<SeriesResp>
}) {
  const cfg = useConfigStore(s => s.config)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const flowHistory = useDrivesStore(s => s.flowHistory)

  // Bombas con caudal propio (manual o caudalímetro propio) y colectores
  const series: SeriesDef[] = useMemo(() => {
    const fms = cfg?.flowmeters || []
    const colectores = fms.filter(f => f.enabled !== false && f.bombas.length > 1)
    const inColector = new Set(colectores.flatMap(f => f.bombas))
    const pumps = (cfg?.devices || []).filter(d => d.caudal && (d.caudal.modo === 'manual' || !inColector.has(d.name)))
    return [
      ...pumps.map(d => ({ key: d.name, label: d.name })),
      ...colectores.map(f => ({ key: FM + f.name, label: colectorLabel(f.name) })),
    ].map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }))
  }, [cfg])
  const keys = series.map(s => s.key)

  const pts = useMemo(() => {
    const raw = data ? fromResp(data) : [
      ...[...driveHistory].flatMap(([name, arr]) => arr.filter(p => p.flow != null).map(p => ({ ts: p.ts, key: name, flow: p.flow!, running: p.running }))),
      ...[...flowHistory].flatMap(([name, arr]) => arr.filter(p => p.flow != null).map(p => ({ ts: p.ts, key: FM + name, flow: p.flow! }))),
    ]
    return raw.filter(p => (since === 0 || p.ts >= since) && p.ts <= until)
  }, [data, driveHistory, flowHistory, since, until])

  const lines = useMemo(() => toChart(pts, keys, false), [pts, keys.join()])
  const stacked = useMemo(() => toChart(pts, keys, true), [pts, keys.join()])

  if (series.length === 0) {
    return <div className="text-center text-muted-foreground text-sm py-10">No hay bombas con caudal configurado. Configuralo en <strong>Configuración → Dispositivos</strong>.</div>
  }
  const rf = (st: boolean) => fetchRange && ((from: string, to: string, ws: number) => fetchRange(from, to, ws).then(d => toChart(fromResp(d), keys, st)))

  return (
    <div className="flex flex-col gap-4">
      <TrendChart title="Caudal por bomba (m³/h)" data={lines} rangeFetch={rf(false)} series={series} unit="m³/h" height={240} decimals={0} yWidth={72} />
      <TrendChart title="Bombas en marcha — caudal apilado (m³/h)" data={stacked} rangeFetch={rf(true)} stacked
        series={[...series, { key: 'total', label: 'Total', color: '#64748b', line: true }]} unit="m³/h" height={260} decimals={0} yWidth={72} />
    </div>
  )
}
