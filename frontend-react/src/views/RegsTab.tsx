// Tendencias → Reguladores (módulo unifilar): igual que Medidores, una sección plegable por
// regulador con su posición de tap (escalonada) y su tensión de carga contra la consigna.
import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import TrendChart, { SERIE_NEUTRA } from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { puntosLibres } from '../components/CampoBase'
import LibresTrend from '../components/LibresTrend'
import { IconoRegulador } from '../components/IconosEquipo'
import { campoChart, type CampoResp } from './RecosTab'
import { cn } from '@/lib/utils'

const enRango = (t: number, since: number, until: number) => (since === 0 || t >= since) && t <= until

export default function RegsTab({ data, since, until, fetchRange }: {
  data: CampoResp | null
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<CampoResp>
}) {
  const regs = (useConfigStore(s => s.config)?.reguladores || []).filter(c => c.enabled !== false)
  const [plegados, setPlegados] = useState<Record<string, boolean>>({})
  const filas = useMemo(() => (data?.campo || []).filter(r => r.kind === 'reg'), [data])
  const conLibres = regs.some(c => { const p = puntosLibres(c); return p.meds.length > 0 || p.senales.length > 0 })

  if (regs.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reguladores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reguladores requiere InfluxDB.</div>

  const rf = (name: string, campos: string[]) => fetchRange && ((from: string, to: string, ws: number) =>
    fetchRange(from, to, ws).then(d => campoChart((d.campo || []).filter(r => r.kind === 'reg'), name, campos)))

  return (
    <div className="flex flex-col gap-4">
      {regs.map(r => {
        const plegado = plegados[r.name] === true
        const tap = campoChart(filas, r.name, ['tap']).filter(p => enRango(p.ts, since, until))
        const volt = campoChart(filas, r.name, ['v', 'vConsigna']).filter(p => enRango(p.ts, since, until))
        const conDatos = tap.length > 0 || volt.length > 0
        return (
          <div key={r.name} className="flex flex-col gap-3">
            <button type="button" onClick={() => setPlegados(s => ({ ...s, [r.name]: !plegado }))} aria-expanded={!plegado}
              className="flex items-center gap-2 pt-2 border-t text-left w-full">
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', plegado && '-rotate-90')} />
              <IconoRegulador className={cn('h-4 w-4 shrink-0', conDatos ? 'text-foreground' : 'text-muted-foreground')} />
              <span className="text-sm font-semibold">{r.name}</span>
              <span className="text-xs text-muted-foreground">Regulador{r.modelo ? ` · ${r.modelo}` : ''}{r.banco ? ` · ${r.banco}` : ''}</span>
              {!conDatos && <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">sin datos en el rango</span>}
            </button>
            {!plegado && (
              <div className="grid gap-4 xl:grid-cols-2">
                <TrendChart title="Posición de tap" data={tap} step unit="" height={180} decimals={0}
                  rangeFetch={rf(r.name, ['tap'])} series={[{ key: 'tap', label: 'Tap', color: SERIE_NEUTRA }]} />
                <TrendChart title="Tensión de carga y consigna (V)" data={volt} unit="V" height={180} yDomain={['auto', 'auto']}
                  rangeFetch={rf(r.name, ['v', 'vConsigna'])}
                  series={[{ key: 'v', label: 'Tensión', color: SERIE_NEUTRA }, { key: 'vConsigna', label: 'Consigna', color: '#C9932E' }]} />
              </div>
            )}
          </div>
        )
      })}
      {/* mediciones libres y perfil entre equipos: a pedido, para no recargar la vista */}
      {conLibres && <details className="bg-card border group">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold tracking-widest uppercase list-none flex items-center gap-2">
          <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>Más mediciones
        </summary>
        <div className="p-3 border-t flex flex-col gap-4">
          <LibresTrend kind="reg" cfgs={regs} name={regs[0].name} data={data} since={since} until={until} fetchRange={fetchRange} />
        </div>
      </details>}
    </div>
  )
}
