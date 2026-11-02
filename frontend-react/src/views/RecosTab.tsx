// Tendencias → Reconectadores (módulo unifilar): corrientes por fase y franja de estado por
// ventana (bloqueado > cerrado > abierto), en los colores del diseño.
import { useMemo, useState } from 'react'
import TrendChart from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { puntosLibres } from '../components/CampoBase'
import LibresTrend, { Franja } from '../components/LibresTrend'
import SelectorCampo from '../components/SelectorCampo'
import { FASOR_COLORES } from '../components/Fasorial'

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
// ISA-101: cerrado = en servicio, abierto en gris, bloqueado como alerta
const COLOR = { cerrado: 'var(--st-run)', abierto: 'hsl(var(--muted-foreground) / 0.55)', bloqueado: 'var(--p3)' }
const TXT = { cerrado: 'Cerrado', abierto: 'Abierto', bloqueado: 'Bloqueado' }

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

  const conLibres = recos.some(c => { const p = puntosLibres(c); return p.meds.length > 0 || p.senales.length > 0 })
  if (recos.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reconectadores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reconectadores requiere InfluxDB.</div>

  return (
    <div className="flex flex-col gap-4">
      {recos.length > 1 && <SelectorCampo cfgs={recos} valor={name!} onChange={setSel} />}
      <section className="bg-card border p-3">
        <Franja titulo={`Estado — ${name}`}
          bloques={rows.map(r => { const e = estadoDe(r); return { key: r._time, color: COLOR[e], title: `${new Date(r._time).toLocaleString('es-AR', { hour12: false })} — ${TXT[e]}` } })}
          leyenda={(Object.keys(COLOR) as (keyof typeof COLOR)[]).map(k => [TXT[k], COLOR[k]] as [string, string])} />
      </section>
      <TrendChart title={`Corrientes por fase — ${name} (A)`} data={chart} unit="A" height={260}
        rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => campoChart((d.campo || []).filter(r => r.kind === 'reco'), name!, ['ia', 'ib', 'ic'])))}
        series={[{ key: 'ia', label: 'Fase A', color: FASOR_COLORES[0] }, { key: 'ib', label: 'Fase B', color: FASOR_COLORES[1] }, { key: 'ic', label: 'Fase C', color: FASOR_COLORES[2] }]} />
      {conLibres && <details className="bg-card border group">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold tracking-widest uppercase list-none flex items-center gap-2">
          <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>Más mediciones
        </summary>
        <div className="p-3 border-t flex flex-col gap-4">
          <LibresTrend kind="reco" cfgs={recos} name={name!} data={data} since={since} until={until} fetchRange={fetchRange} />
        </div>
      </details>}
    </div>
  )
}
