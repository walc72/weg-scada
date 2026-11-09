// Tendencias → Generadores (módulo generadores): franja de estado por ventana (en carga / en marcha /
// parado) y potencia, tensión L-L y frecuencia; el resto de las mediciones en «Más mediciones».
import { useMemo, useState } from 'react'
import { ChevronDown, Zap } from 'lucide-react'
import TrendChart from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { Franja, MasMediciones } from '../components/LibresTrend'
import { colorFase, colorMagnitud, colorSerie, faseDeIndice } from '@/lib/paleta'
import { campoChart, type CampoResp, type CampoRow } from './RecosTab'
import { cn } from '@/lib/utils'

// mismos umbrales que estadoGen (lib/generador)
const estadoDe = (r: CampoRow) => (Number(r.rpm) > 300 ? (Number(r.kw) > 0.5 ? 'carga' : 'marcha') : 'parado')
const COLOR = { carga: 'var(--st-run)', marcha: 'color-mix(in srgb, var(--st-run) 45%, transparent)', parado: 'hsl(var(--muted-foreground) / 0.55)' }
const TXT = { carga: 'En carga', marcha: 'En marcha', parado: 'Parado' }
const GRAF = [
  { titulo: 'Potencia activa (kW)', unit: 'kW', dec: 0, series: [{ key: 'kw', label: 'kW', color: colorMagnitud('potencia') }] },
  { titulo: 'Tensión L-L (V)', unit: 'V', dec: 0, series: ['vl1l2', 'vl2l3', 'vl3l1'].map((key, k) => ({ key, label: ['L1-L2', 'L2-L3', 'L3-L1'][k], color: colorFase(faseDeIndice(k)) })) },
  { titulo: 'Frecuencia (Hz)', unit: 'Hz', dec: 1, series: [{ key: 'hz', label: 'Frecuencia', color: colorSerie(0) }] },
]

export default function GensTab({ data, since, until, fetchRange }: {
  data: CampoResp | null
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<CampoResp>
}) {
  const gens = (useConfigStore(s => s.config)?.generadores || []).filter(c => c.enabled !== false)
  const [plegados, setPlegados] = useState<Record<string, boolean>>({})
  const filas = useMemo(() => (data?.campo || []).filter(r => r.kind === 'gen')
    .filter(r => { const t = new Date(r._time).getTime(); return (since === 0 || t >= since) && t <= until })
    .sort((a, b) => a._time.localeCompare(b._time)), [data, since, until])

  if (gens.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay generadores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de generadores requiere InfluxDB.</div>

  return (
    <div className="flex flex-col gap-4">
      {gens.map(c => {
        const plegado = plegados[c.name] === true
        const rows = filas.filter(r => r.name === c.name)
        return (
          <div key={c.name} className="flex flex-col gap-3">
            <button type="button" onClick={() => setPlegados(s => ({ ...s, [c.name]: !plegado }))} aria-expanded={!plegado}
              className="flex items-center gap-2 pt-2 border-t text-left w-full">
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', plegado && '-rotate-90')} />
              <Zap className={cn('h-4 w-4 shrink-0', rows.length ? 'text-foreground' : 'text-muted-foreground')} />
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="text-xs text-muted-foreground">Generador{c.modelo ? ` · ${c.modelo}` : ''}</span>
              {!rows.length && <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">sin datos en el rango</span>}
            </button>
            {!plegado && (
              <div className="flex flex-col gap-4">
                <section className="bg-card border p-3">
                  <Franja titulo="Estado"
                    bloques={rows.map(r => { const e = estadoDe(r); return { key: r._time, color: COLOR[e], title: `${new Date(r._time).toLocaleString('es-AR', { hour12: false })} — ${TXT[e]}` } })}
                    leyenda={(Object.keys(COLOR) as (keyof typeof COLOR)[]).map(k => [TXT[k], COLOR[k]] as [string, string])} />
                </section>
                <div className="grid gap-4 xl:grid-cols-3">
                  {GRAF.map(g => {
                    const campos = g.series.map(s => s.key)
                    return (
                      <TrendChart key={g.titulo} title={g.titulo} data={campoChart(rows, c.name, campos)} unit={g.unit} decimals={g.dec} height={180} yDomain={['auto', 'auto']}
                        rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => campoChart((d.campo || []).filter(r => r.kind === 'gen'), c.name, campos)))}
                        series={g.series} />
                    )
                  })}
                </div>
              </div>
            )}
            {!plegado && <MasMediciones kind="gen" cfg={c} data={data} since={since} until={until} fetchRange={fetchRange} />}
          </div>
        )
      })}
    </div>
  )
}
