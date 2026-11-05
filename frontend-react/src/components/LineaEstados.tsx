import { SkeletonBloque } from './ui/skeleton'
import { useEffect, useState } from 'react'
import { authFetch } from '../store/auth'

const DATA_MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

interface Tramo { desde: number; hasta: number; estado: string }
interface Linea { desde: number; hasta: number; tramos: Tramo[]; resumen: Record<string, number> }

// Texto y color de cada estado (ISA-101: color solo para lo que importa; parado / abierto en gris)
const ESTADOS: Record<string, { txt: string; bg: string; patron?: boolean }> = {
  marcha: { txt: 'En marcha', bg: 'var(--st-run)' },
  carga: { txt: 'En carga', bg: 'var(--st-run)' },  // generador con kW
  parada: { txt: 'Parado', bg: 'hsl(var(--muted-foreground) / 0.55)' },
  falla: { txt: 'Falla', bg: 'var(--p1)' },
  cerrado: { txt: 'Cerrado', bg: 'var(--st-run)' },
  abierto: { txt: 'Abierto', bg: 'hsl(var(--muted-foreground) / 0.45)' },
  bloqueado: { txt: 'Bloqueado', bg: 'var(--p3)' },
  disparo: { txt: 'Disparo', bg: 'var(--p1)' },
  auto: { txt: 'Automático', bg: 'hsl(var(--muted-foreground) / 0.45)' },
  manual: { txt: 'Manual', bg: 'var(--p3)' },
  sin_com: { txt: 'Sin comunicación', bg: 'var(--st-com)', patron: true },
  sin_datos: { txt: 'Sin datos', bg: 'transparent' },
}
const RANGOS = [{ id: '24h', label: '24 H', ms: 864e5 }, { id: '7d', label: '7 D', ms: 7 * 864e5 }, { id: '30d', label: '30 D', ms: 30 * 864e5 }]

const fFecha = (t: number, conDia: boolean) => new Date(t).toLocaleString('es-AR', conDia ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit', hour12: false })
const fDur = (h: number) => (h >= 24 ? `${(h / 24).toLocaleString('es-AR', { maximumFractionDigits: 1 })} d` : h >= 1 ? `${h.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h` : `${Math.round(h * 60)} min`)

// Demo sin backend: un día inventado con marchas, una parada, una falla y un corte
function demo(desde: number, hasta: number, motor: boolean): Linea {
  const span = hasta - desde, f = (x: number) => desde + span * x
  const seq: [number, number, string][] = motor
    ? [[0, 0.22, 'marcha'], [0.22, 0.3, 'parada'], [0.3, 0.55, 'marcha'], [0.55, 0.58, 'falla'], [0.58, 0.7, 'parada'], [0.7, 0.74, 'sin_com'], [0.74, 1, 'marcha']]
    : [[0, 0.62, 'cerrado'], [0.62, 0.64, 'disparo'], [0.64, 0.7, 'abierto'], [0.7, 1, 'cerrado']]
  const tramos = seq.map(([a, b, estado]) => ({ desde: f(a), hasta: f(b), estado }))
  const resumen: Record<string, number> = {}
  for (const t of tramos) resumen[t.estado] = (resumen[t.estado] || 0) + (t.hasta - t.desde) / 36e5
  return { desde, hasta, tramos, resumen }
}

// Línea de tiempo de estados de un equipo: barra con un tramo por estado, marcas de tiempo y totales
export default function LineaEstados({ name, motor = true }: { name: string; motor?: boolean }) {
  const [rango, setRango] = useState(RANGOS[0])
  const [linea, setLinea] = useState<Linea | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const hasta = Date.now(), desde = hasta - rango.ms
    if (DATA_MODE !== 'live') { setLinea(demo(desde, hasta, motor)); return }
    let vivo = true
    setLinea(null); setError('')
    authFetch(`/api/reports/estados?name=${encodeURIComponent(name)}&from=${new Date(desde).toISOString()}&to=${new Date(hasta).toISOString()}`)
      .then(async r => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`); return j })
      .then(j => { if (vivo) setLinea(j) })
      .catch(e => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [name, rango, motor])

  const span = linea ? linea.hasta - linea.desde : 1
  const pct = (t: number) => ((t - (linea?.desde ?? 0)) / span) * 100
  const conDia = rango.ms > 864e5
  const marcas = linea ? Array.from({ length: 7 }, (_, i) => linea.desde + (span * i) / 6) : []
  const total = linea ? Object.entries(linea.resumen).filter(([e]) => e !== 'sin_datos').reduce((a, [, h]) => a + h, 0) : 0

  return (
    <section aria-labelledby={`t-estados-${name}`} className="bg-card border">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 border-b">
        <h2 id={`t-estados-${name}`} className="text-xs font-bold tracking-widest">LÍNEA DE TIEMPO DE ESTADOS</h2>
        <div role="group" aria-label="Período" className="ml-auto inline-flex border border-border">
          {RANGOS.map(r => (
            <button key={r.id} type="button" aria-pressed={r.id === rango.id} onClick={() => setRango(r)}
              className={`px-2.5 min-h-[28px] text-[11px] font-semibold tracking-wider ${r.id === rango.id ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}>{r.label}</button>
          ))}
        </div>
      </header>
      <div className="p-3">
        {error ? <div className="text-sm text-muted-foreground">No se pudo armar la línea: {error}</div>
          : !linea ? <SkeletonBloque className="h-10" />
          : <>
            {/* la barra: cada tramo con el color de su estado; al pasar el mouse, desde-hasta y duración */}
            <div className="relative h-8 border border-border overflow-hidden" style={{ background: 'var(--bar-track)' }}>
              {linea.tramos.map(t => {
                const e = ESTADOS[t.estado] ?? { txt: t.estado, bg: 'hsl(var(--muted-foreground))' }
                const fondo = t.estado === 'sin_datos' ? 'repeating-linear-gradient(45deg, transparent 0 4px, hsl(var(--border)) 4px 5px)'
                  : e.patron ? `repeating-linear-gradient(-45deg, ${e.bg} 0 4px, transparent 4px 7px)` : e.bg
                return (
                  <div key={t.desde} className="absolute inset-y-0" title={`${e.txt} · ${fFecha(t.desde, true)} – ${fFecha(t.hasta, true)} (${fDur((t.hasta - t.desde) / 36e5)})`}
                    style={{ left: `${pct(t.desde)}%`, width: `max(1px, ${pct(t.hasta) - pct(t.desde)}%)`, background: fondo }} />
                )
              })}
            </div>
            <div className="relative h-4 mt-1 font-mono text-[10px] text-muted-foreground">
              {marcas.map((t, i) => (
                <span key={t} className="absolute whitespace-nowrap" style={{ left: `${(i / 6) * 100}%`, transform: i === 0 ? 'none' : i === 6 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{fFecha(t, conDia)}</span>
              ))}
            </div>
            {/* totales del período por estado */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
              {Object.entries(linea.resumen).sort((a, b) => b[1] - a[1]).map(([estado, h]) => {
                const e = ESTADOS[estado] ?? { txt: estado, bg: 'hsl(var(--muted-foreground))' }
                return (
                  <span key={estado} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 border border-border shrink-0" style={{ background: estado === 'sin_datos' ? 'repeating-linear-gradient(45deg, transparent 0 2px, hsl(var(--border)) 2px 3px)' : e.patron ? `repeating-linear-gradient(-45deg, ${e.bg} 0 2px, transparent 2px 4px)` : e.bg }} />
                    <span className="text-muted-foreground">{e.txt}</span>
                    <span className="font-mono tabular-nums">{fDur(h)}{estado !== 'sin_datos' && total ? ` · ${Math.round((h / total) * 100)} %` : ''}</span>
                  </span>
                )
              })}
            </div>
          </>}
      </div>
    </section>
  )
}
