import { memo } from 'react'
import { Link } from 'react-router'
import type { Drive } from '../types'
import type { GaugeZone } from '../lib/gaugeDefaults'
import { resolveZone } from '../lib/gaugeDefaults'
import { isStale, driveHasAnyAlarm } from '../store/drives'
import { useNow } from '@/lib/useNow'
import { fmt } from '@/lib/utils'
import { barra } from './HalfGauge'
import type { Tarjeta, EstadoHist } from '@/lib/useTarjetas'
import { fmtDuracion } from '@/lib/duracion'

type Estado = { txt: string; bg: string; fg: string; bd: string; sym: string; symFill: string; letra: string; dash?: string; tile?: React.CSSProperties; dim?: boolean }

const RUN: Estado = { txt: 'MARCHA', bg: 'var(--st-run)', fg: 'var(--st-run-fg)', bd: 'var(--st-run)', sym: 'var(--st-run)', symFill: 'var(--st-run)', letra: 'var(--st-run-fg)' }
const STOP: Estado = { txt: 'DETENIDO', bg: 'transparent', fg: 'hsl(var(--muted-foreground))', bd: 'hsl(var(--border))', sym: 'hsl(var(--muted-foreground))', symFill: 'none', letra: 'hsl(var(--muted-foreground))' }
export const FALLA: Estado = { txt: 'FALLA', bg: 'var(--p1)', fg: '#16191C', bd: 'var(--p1)', sym: 'var(--p1)', symFill: 'none', letra: 'var(--p1-text)', tile: { borderColor: 'var(--p1)', borderWidth: 2 } }
const SINCOM: Estado = { txt: 'SIN COMUNICACIÓN', bg: 'var(--st-com)', fg: 'var(--st-com-fg)', bd: 'var(--st-com)', sym: 'var(--st-com)', symFill: 'none', letra: 'var(--st-com)', dash: '4 3', tile: { borderColor: 'var(--st-com)', borderStyle: 'dashed' }, dim: true }
const DESACT: Estado = { ...STOP, txt: 'DESACTUALIZADO', dim: true }
// Fuera de servicio: gris rayado, sin color (no es una anomalía)
const RAYADO = 'repeating-linear-gradient(135deg, transparent 0 6px, hsl(var(--muted-foreground) / 0.14) 6px 12px)'
const FUERA: Estado = { ...STOP, txt: 'FUERA DE SERVICIO', dash: '2 3', tile: { backgroundImage: RAYADO }, dim: true }

export function estado(d: Drive, stale: boolean): Estado {
  if (d.fueraServicio) return FUERA
  if (!d.online) return SINCOM
  if (stale) return DESACT
  if (d.hasFault) return FALLA
  return d.running ? RUN : STOP
}

// Mímico de la línea: un símbolo de motor (M 3~) por drive, entre colector y toma.
// Click → baja a la tarjeta del equipo.
// Estado en vivo ↔ estado del histórico: el «desde» solo se muestra si coinciden
const HIST = new Map<Estado, EstadoHist>([[RUN, 'marcha'], [STOP, 'parada'], [FALLA, 'falla'], [SINCOM, 'sin_com']])
const fmtFecha = (ms: number) => new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

function desdeTxt(t: Tarjeta | undefined, e: Estado, now: number): string | null {
  if (!t || HIST.get(e) !== t.estado) return null
  if (t.mas24h) return '> 24 h'
  if (e === SINCOM && now - t.desde >= 864e5) return `desde ${fmtFecha(t.desde)}`
  return fmtDuracion(now - t.desde)
}

// Corriente de la última hora (un punto por minuto) en la escala de la barra
function Mini({ serie, max }: { serie: (number | null)[]; max: number }) {
  if (!serie.some(v => v != null && v > 0)) return null
  const n = serie.length - 1 || 1
  const pts = serie.map((v, i) => v == null ? null : `${(i / n) * 100},${16 - Math.min(1, v / (max || 1)) * 15}`)
  // Tramos sin dato cortan la línea
  const tramos = pts.reduce<string[][]>((acc, p) => { if (p == null) acc.push([]); else acc[acc.length - 1].push(p); return acc }, [[]]).filter(t => t.length > 1)
  return (
    <svg viewBox="0 0 100 16" preserveAspectRatio="none" className="w-full h-4" aria-hidden>
      {tramos.map((t, i) => <polyline key={i} points={t.join(' ')} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />)}
    </svg>
  )
}

// Una fila (banco) por sitio: cada grupo con su colector y toma
export default memo(function MotorStrip({ grupos, gaugeZones, tarjetas = {} }: { grupos: { sitio: string | null; items: Drive[] }[]; gaugeZones: Record<string, Record<string, Partial<GaugeZone>>>; tarjetas?: Record<string, Tarjeta> }) {
  const now = useNow()
  const drives = grupos.flatMap(g => g.items)
  const running = drives.filter(d => d.online && d.running).length
  return (
    <section aria-labelledby="t-linea" className="bg-card border h-full">
      <header className="flex items-center gap-3 px-3 py-2 border-b flex-wrap">
        <h2 id="t-linea" className="text-xs font-bold tracking-widest">LÍNEA DE BOMBEO</h2>
        <span className="text-[11px] text-muted-foreground font-mono">{running} / {drives.filter(d => !d.fueraServicio).length} en marcha</span>
        <span className="ml-auto flex gap-3 flex-wrap text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--st-run)' }} />Marcha</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-full border border-muted-foreground" />Detenido</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: 'var(--p1)' }} />Falla</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: 'var(--st-com)' }} />Sin comunicación</span>
          {drives.some(d => d.fueraServicio) && <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 border border-muted-foreground" style={{ backgroundImage: RAYADO }} />Fuera de servicio</span>}
        </span>
      </header>
      <div className="p-3 flex flex-col gap-4">
        {grupos.map(g => (
        <section key={g.sitio ?? ''} aria-label={g.sitio ? `Banco ${g.sitio}` : 'Sin sitio'}>
        <h3 className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-1.5">{g.sitio ? `Banco ${g.sitio}` : 'Sin sitio'}</h3>
        <div className="h-1 mb-2" style={{ background: 'hsl(var(--muted-foreground) / 0.5)' }} aria-hidden />
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
          {g.items.map(d => {
            const stale = d.online && isStale(d._ts, now, d.pollMs)
            const e = estado(d, stale)
            const z = resolveZone(d.type, 'corriente', gaugeZones?.[d.name]?.corriente)
            const b = barra({ value: d.current || 0, ...z })
            const alarma = d.online && !stale && !d.hasFault && driveHasAnyAlarm(d)
            const fill = b.nivel === 'ok' ? 'var(--bar-fill)' : b.nivel === 'warn' ? 'var(--p3)' : 'var(--p1)'
            const tj = tarjetas[d.name]
            const desde = desdeTxt(tj, e, now)
            return (
              <Link key={d.name} to={`/motor/${encodeURIComponent(d.name)}`}
                className="flex flex-col gap-1.5 p-2 border bg-background hover:bg-muted/60 transition-colors" style={e.tile}>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[13px] font-bold tracking-wide truncate">{d.displayName || d.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{d.type}</span>
                </div>
                <div className="flex justify-center relative">
                  <svg width="52" height="52" viewBox="0 0 52 52" role="img" aria-label={`Motor ${d.displayName || d.name}: ${e.txt}`}>
                    <circle cx="26" cy="26" r="21" style={{ fill: e.symFill, stroke: e.sym, strokeWidth: 2, strokeDasharray: e.dash }} />
                    <text x="26" y="28" textAnchor="middle" style={{ fill: e.letra, font: "700 17px 'IBM Plex Sans', sans-serif" }}>M</text>
                    <text x="26" y="40" textAnchor="middle" style={{ fill: e.letra, font: "600 9px 'IBM Plex Mono', monospace" }}>3~</text>
                  </svg>
                  {alarma && <span className="absolute right-0 top-0 px-1 text-[10px] font-bold font-mono" style={{ background: 'var(--p3)', color: '#16191C' }}>P3</span>}
                </div>
                <span className={`text-center text-[10px] font-bold tracking-wide leading-tight py-0.5 px-0.5 border ${e === FALLA ? 'blink' : ''}`}
                  style={{ background: e.bg, color: e.fg, borderColor: e.bd }}>{e.txt}</span>
                {desde && <span className="-mt-1 text-center text-[10px] font-mono text-muted-foreground tabular-nums" title="Tiempo en el estado actual">{desde}</span>}
                <div className={`flex flex-col gap-1 ${e.dim ? 'opacity-45' : ''}`}>
                  <div className="flex justify-between font-mono text-[13px] tabular-nums">
                    <span className="whitespace-nowrap">{fmt(d.current || 0, 0)} <span className="text-[11px] text-muted-foreground">A</span></span>
                    <span className="whitespace-nowrap">{fmt(d.power || 0, 0)} <span className="text-[11px] text-muted-foreground">kW</span></span>
                  </div>
                  <div className="relative h-2 border" style={{ background: 'var(--bar-track)' }}>
                    <div className="absolute inset-y-0" style={{ left: `${b.bandL}%`, width: `${b.bandW}%`, background: 'var(--bar-band)' }} />
                    <div className="absolute left-0 top-px bottom-px" style={{ width: `${b.pos}%`, background: fill }} />
                  </div>
                  {tj && e !== SINCOM && <span title="Corriente, última hora"><Mini serie={tj.corriente} max={z.max} /></span>}
                </div>
              </Link>
            )
          })}
        </div>
        <div className="h-1 mt-2" style={{ background: 'hsl(var(--muted-foreground) / 0.5)' }} aria-hidden />
        </section>
        ))}
      </div>
    </section>
  )
})
