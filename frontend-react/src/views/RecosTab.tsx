// Tendencias → Reconectadores (módulo unifilar): corrientes por fase y franja de estado por
// ventana (bloqueado > cerrado > abierto), en los colores del diseño.
import { useMemo, useState } from 'react'
import TrendChart from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { Franja, MasMediciones } from '../components/LibresTrend'
import { ChevronDown } from 'lucide-react'
import { IconoReconectador } from '../components/IconosEquipo'
import { cn } from '@/lib/utils'
import { FASOR_COLORES } from '../components/Fasorial'
import type { CampoKind } from '../types'

export type CampoRow = { _time: string; name: string; kind: CampoKind; [k: string]: number | string | undefined }
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
  const [plegados, setPlegados] = useState<Record<string, boolean>>({})
  const filas = useMemo(() => (data?.campo || []).filter(r => r.kind === 'reco')
    .filter(r => { const t = new Date(r._time).getTime(); return (since === 0 || t >= since) && t <= until })
    .sort((a, b) => a._time.localeCompare(b._time)), [data, since, until])

  if (recos.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reconectadores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reconectadores requiere InfluxDB.</div>

  // igual que Medidores: una sección plegable por reconectador (estado + corrientes por fase)
  return (
    <div className="flex flex-col gap-4">
      {recos.map(c => {
        const plegado = plegados[c.name] === true
        const rows = filas.filter(r => r.name === c.name)
        const chart = campoChart(rows, c.name, ['ia', 'ib', 'ic'])
        return (
          <div key={c.name} className="flex flex-col gap-3">
            <button type="button" onClick={() => setPlegados(s => ({ ...s, [c.name]: !plegado }))} aria-expanded={!plegado}
              className="flex items-center gap-2 pt-2 border-t text-left w-full">
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', plegado && '-rotate-90')} />
              <IconoReconectador className={cn('h-4 w-4 shrink-0', rows.length ? 'text-foreground' : 'text-muted-foreground')} />
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="text-xs text-muted-foreground">Reconectador{c.modelo ? ` · ${c.modelo}` : ''}</span>
              {!rows.length && <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">sin datos en el rango</span>}
            </button>
            {!plegado && (
              <div className="flex flex-col gap-4">
                <section className="bg-card border p-3">
                  <Franja titulo="Estado"
                    bloques={rows.map(r => { const e = estadoDe(r); return { key: r._time, color: COLOR[e], title: `${new Date(r._time).toLocaleString('es-AR', { hour12: false })} — ${TXT[e]}` } })}
                    leyenda={(Object.keys(COLOR) as (keyof typeof COLOR)[]).map(k => [TXT[k], COLOR[k]] as [string, string])} />
                </section>
                <TrendChart title="Corrientes por fase (A)" data={chart} unit="A" height={180}
                  rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => campoChart((d.campo || []).filter(r => r.kind === 'reco'), c.name, ['ia', 'ib', 'ic'])))}
                  series={[{ key: 'ia', label: 'Fase A', color: FASOR_COLORES[0] }, { key: 'ib', label: 'Fase B', color: FASOR_COLORES[1] }, { key: 'ic', label: 'Fase C', color: FASOR_COLORES[2] }]} />
              </div>
            )}
            {!plegado && <MasMediciones kind="reco" cfg={c} data={data} since={since} until={until} fetchRange={fetchRange} />}
          </div>
        )
      })}
    </div>
  )
}
