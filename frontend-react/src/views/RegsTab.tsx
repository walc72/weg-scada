// Tendencias → Reguladores (módulo unifilar): igual que Medidores, una sección plegable por
// regulador con su posición de tap (escalonada) y su tensión de carga contra la consigna.
import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import TrendChart, { SERIE_NEUTRA } from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { Franja, MasMediciones } from '../components/LibresTrend'
import { IconoRegulador } from '../components/IconosEquipo'
import { campoChart, type CampoResp } from './RecosTab'
import { porBanco } from '../components/Fasorial'
import { cn } from '@/lib/utils'

const enRango = (t: number, since: number, until: number) => (since === 0 || t >= since) && t <= until
const fH = (iso: string) => new Date(iso).toLocaleString('es-AR', { hour12: false })

export default function RegsTab({ data, since, until, fetchRange }: {
  data: CampoResp | null
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<CampoResp>
}) {
  const regs = (useConfigStore(s => s.config)?.reguladores || []).filter(c => c.enabled !== false)
  const [plegados, setPlegados] = useState<Record<string, boolean>>({})
  const filas = useMemo(() => (data?.campo || []).filter(r => r.kind === 'reg'), [data])

  if (regs.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reguladores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reguladores requiere InfluxDB.</div>

  const rf = (name: string, campos: string[]) => fetchRange && ((from: string, to: string, ws: number) =>
    fetchRange(from, to, ws).then(d => campoChart((d.campo || []).filter(r => r.kind === 'reg'), name, campos)))

  return (
    <div className="flex flex-col gap-4">
      {/* agrupados por banco: encabezado plegable del banco y, adentro, una sección por regulador */}
      {porBanco(regs).map(g => {
        const clave = `banco:${g.banco ?? ''}`
        const gPlegado = plegados[clave] === true
        return (
          <section key={clave} aria-label={g.banco ?? 'Sin banco'} className="bg-card border">
            <button type="button" onClick={() => setPlegados(s => ({ ...s, [clave]: !gPlegado }))} aria-expanded={!gPlegado}
              className="flex items-center gap-2 px-3 py-2.5 text-left w-full">
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', gPlegado && '-rotate-90')} />
              <h2 className="text-xs font-bold tracking-widest uppercase">{g.banco ?? 'Sin banco'}</h2>
              <span className="text-[11px] font-mono text-muted-foreground">{g.regs.length} {g.regs.length === 1 ? 'regulador' : 'reguladores'}</span>
            </button>
            {!gPlegado && <div className="px-3 pb-3 flex flex-col gap-4">
      {g.regs.map(r => {
        const plegado = plegados[r.name] === true
        const tap = campoChart(filas, r.name, ['tap']).filter(p => enRango(p.ts, since, until))
        const volt = campoChart(filas, r.name, ['v', 'vConsigna']).filter(p => enRango(p.ts, since, until))
        // franjas de modo: Automático/Manual y, si el equipo lo informa, Remoto/Local (mayoría de cada ventana)
        const modos = filas.filter(f => f.name === r.name && typeof f.auto === 'number' && enRango(new Date(f._time).getTime(), since, until))
          .sort((a, b) => a._time.localeCompare(b._time))
          .map(f => ({ _time: f._time, auto: (f.auto as number) >= 0.5, remoto: typeof f.remoto === 'number' ? f.remoto >= 0.5 : null }))
        const conMando = modos.some(m => m.remoto != null)
        const conDatos = tap.length > 0 || volt.length > 0
        return (
          <div key={r.name} className="flex flex-col gap-3">
            <button type="button" onClick={() => setPlegados(s => ({ ...s, [r.name]: !plegado }))} aria-expanded={!plegado}
              className="flex items-center gap-2 pt-2 border-t text-left w-full">
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', plegado && '-rotate-90')} />
              <IconoRegulador className={cn('h-4 w-4 shrink-0', conDatos ? 'text-foreground' : 'text-muted-foreground')} />
              <span className="text-sm font-semibold">{r.name}</span>
              <span className="text-xs text-muted-foreground">Regulador{r.modelo ? ` · ${r.modelo}` : ''}</span>
              {!conDatos && <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">sin datos en el rango</span>}
            </button>
            {!plegado && modos.length > 0 && (
              <div className="bg-card border p-3 flex flex-col gap-3">
                <Franja titulo="Modo"
                  bloques={modos.map(m => ({ key: m._time, color: m.auto ? 'var(--st-run)' : 'var(--p3)', title: `${fH(m._time)} — ${m.auto ? 'Automático' : 'Manual'}` }))}
                  leyenda={[['Automático', 'var(--st-run)'], ['Manual', 'var(--p3)']]} />
                {conMando && <Franja titulo="Mando"
                  bloques={modos.map(m => ({ key: m._time, color: m.remoto == null ? 'transparent' : m.remoto ? 'hsl(var(--muted-foreground) / 0.55)' : 'var(--p3)', title: `${fH(m._time)} — ${m.remoto == null ? 'sin dato' : m.remoto ? 'Remoto' : 'Local'}` }))}
                  leyenda={[['Remoto', 'hsl(var(--muted-foreground) / 0.55)'], ['Local', 'var(--p3)']]} />}
              </div>
            )}
            {!plegado && (
              <div className="grid gap-4 xl:grid-cols-2">
                <TrendChart title="Posición de tap" data={tap} step unit="" height={180} decimals={0}
                  rangeFetch={rf(r.name, ['tap'])} series={[{ key: 'tap', label: 'Tap', color: SERIE_NEUTRA }]} />
                <TrendChart title="Tensión de carga y consigna (V)" data={volt} unit="V" height={180} yDomain={['auto', 'auto']}
                  rangeFetch={rf(r.name, ['v', 'vConsigna'])}
                  series={[{ key: 'v', label: 'Tensión', color: SERIE_NEUTRA }, { key: 'vConsigna', label: 'Consigna', color: '#C9932E' }]} />
              </div>
            )}
            {!plegado && <MasMediciones kind="reg" cfg={r} data={data} since={since} until={until} fetchRange={fetchRange} />}
          </div>
        )
      })}
            </div>}
          </section>
        )
      })}
    </div>
  )
}
