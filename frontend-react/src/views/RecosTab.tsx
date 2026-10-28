// Tendencias → Reconectadores (módulo unifilar, spec §6.3): corrientes por fase
// y franja de estado por ventana (bloqueado > cerrado > abierto).
import { useMemo, useState } from 'react'
import TrendChart from '../components/TrendChart'
import { useConfigStore } from '../store/config'

export type CampoRow = { _time: string; name: string; kind: 'reco' | 'reg'; [k: string]: number | string | undefined }
export type CampoResp = { campo?: CampoRow[] }

const num = (v: unknown) => (typeof v === 'number' && !isNaN(v) ? v : undefined)
export const campoChart = (rows: CampoRow[], name: string, fields: string[]) =>
  rows.filter(r => r.name === name).map(r => {
    const o: Record<string, number> = { ts: new Date(r._time).getTime() }
    for (const f of fields) { const v = num(r[f]); if (v !== undefined) o[f] = v }
    return o
  }).sort((a, b) => a.ts - b.ts)

const estadoDe = (r: CampoRow) => (Number(r.bloqueo) >= 0.5 ? 'bloqueado' : Number(r.estado) >= 0.5 ? 'cerrado' : 'abierto')
const COLOR = { bloqueado: '#ef4444', cerrado: '#22c55e', abierto: '#94a3b8' }

export default function RecosTab({ data, since, until, fetchRange }: {
  data: CampoResp | null   // null = sin InfluxDB (no hay buffer de estos equipos)
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<CampoResp>
}) {
  const recos = useConfigStore(s => s.config)?.reconectadores || []
  const [sel, setSel] = useState('')
  const name = recos.some(r => r.name === sel) ? sel : recos[0]?.name
  const rows = useMemo(() => (data?.campo || []).filter(r => r.kind === 'reco' && r.name === name)
    .filter(r => { const t = new Date(r._time).getTime(); return (since === 0 || t >= since) && t <= until })
    .sort((a, b) => a._time.localeCompare(b._time)), [data, name, since, until])
  const chart = useMemo(() => campoChart(rows, name!, ['ia', 'ib', 'ic']), [rows, name])

  if (recos.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reconectadores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reconectadores requiere InfluxDB.</div>

  return (
    <div className="flex flex-col gap-4">
      <select value={name} onChange={e => setSel(e.target.value)} className="self-start rounded-md border border-border bg-background px-2 py-1 text-sm">
        {recos.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
      </select>
      <TrendChart title={`Corrientes — ${name} (A)`} data={chart} unit="A" height={240} decimals={1}
        rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => campoChart((d.campo || []).filter(r => r.kind === 'reco'), name!, ['ia', 'ib', 'ic'])))}
        series={[{ key: 'ia', label: 'Ia', color: '#ef4444' }, { key: 'ib', label: 'Ib', color: '#f59e0b' }, { key: 'ic', label: 'Ic', color: '#3b82f6' }]} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Estado</p>
        <div className="flex h-5 w-full overflow-hidden rounded border border-border">
          {rows.map(r => { const e = estadoDe(r); return <div key={r._time} className="flex-1" style={{ background: COLOR[e] }} title={`${new Date(r._time).toLocaleString('es-AR')} — ${e}`} /> })}
        </div>
        <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
          {(Object.keys(COLOR) as (keyof typeof COLOR)[]).map(k => <span key={k} className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLOR[k] }} />{k}</span>)}
        </div>
      </div>
    </div>
  )
}
