import { memo } from 'react'
import type { Drive } from '../types'
import type { GaugeZone } from '../lib/gaugeDefaults'
import { resolveZone } from '../lib/gaugeDefaults'
import { isStale, driveHasAnyAlarm } from '../store/drives'
import { useNow } from '@/lib/useNow'
import { fmt } from '@/lib/utils'
import { barra } from './HalfGauge'

type Estado = { txt: string; bg: string; fg: string; bd: string; sym: string; symFill: string; letra: string; dash?: string; tile?: React.CSSProperties; dim?: boolean }

const RUN: Estado = { txt: 'MARCHA', bg: 'var(--st-run)', fg: 'var(--st-run-fg)', bd: 'var(--st-run)', sym: 'var(--st-run)', symFill: 'var(--st-run)', letra: 'var(--st-run-fg)' }
const STOP: Estado = { txt: 'DETENIDO', bg: 'transparent', fg: 'hsl(var(--muted-foreground))', bd: 'hsl(var(--border))', sym: 'hsl(var(--muted-foreground))', symFill: 'none', letra: 'hsl(var(--muted-foreground))' }
export const FALLA: Estado = { txt: 'FALLA', bg: 'var(--p1)', fg: '#16191C', bd: 'var(--p1)', sym: 'var(--p1)', symFill: 'none', letra: 'var(--p1-text)', tile: { borderColor: 'var(--p1)', borderWidth: 2 } }
const SINCOM: Estado = { txt: 'SIN COM.', bg: 'var(--st-com)', fg: '#16191C', bd: 'var(--st-com)', sym: 'var(--st-com)', symFill: 'none', letra: 'var(--st-com)', dash: '4 3', tile: { borderColor: 'var(--st-com)', borderStyle: 'dashed' }, dim: true }
const DESACT: Estado = { ...STOP, txt: 'DESACT.', dim: true }

export function estado(d: Drive, stale: boolean): Estado {
  if (!d.online) return SINCOM
  if (stale) return DESACT
  if (d.hasFault) return FALLA
  return d.running ? RUN : STOP
}

// Mímico de la línea: un símbolo de motor (M 3~) por drive, entre colector y toma.
// Click → baja a la tarjeta del equipo.
export default memo(function MotorStrip({ drives, gaugeZones }: { drives: Drive[]; gaugeZones: Record<string, Record<string, Partial<GaugeZone>>> }) {
  const now = useNow()
  const running = drives.filter(d => d.online && d.running).length
  return (
    <section aria-labelledby="t-linea" className="bg-card border">
      <header className="flex items-center gap-3 px-3 py-2 border-b flex-wrap">
        <h2 id="t-linea" className="text-xs font-bold tracking-widest">LÍNEA DE BOMBEO</h2>
        <span className="text-[11px] text-muted-foreground font-mono">{running} / {drives.length} en marcha</span>
        <span className="ml-auto flex gap-3 flex-wrap text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--st-run)' }} />Marcha</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-full border border-muted-foreground" />Detenido</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: 'var(--p1)' }} />Falla</span>
          <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: 'var(--st-com)' }} />Sin comunicación</span>
        </span>
      </header>
      <div className="p-3">
        <div className="h-1 mb-2" style={{ background: 'hsl(var(--muted-foreground) / 0.5)' }} aria-hidden />
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
          {drives.map(d => {
            const stale = d.online && isStale(d._ts, now, d.pollMs)
            const e = estado(d, stale)
            const z = resolveZone(d.type, 'corriente', gaugeZones?.[d.name]?.corriente)
            const b = barra({ value: d.current || 0, ...z })
            const alarma = d.online && !stale && !d.hasFault && driveHasAnyAlarm(d)
            const fill = b.nivel === 'ok' ? 'var(--bar-fill)' : b.nivel === 'warn' ? 'var(--p3)' : 'var(--p1)'
            return (
              <a key={d.name} href={`#drive-${d.name}`}
                onClick={ev => { ev.preventDefault(); document.getElementById(`drive-${d.name}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
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
                <span className={`text-center text-[11px] font-bold tracking-widest py-0.5 border ${e === FALLA ? 'blink' : ''}`}
                  style={{ background: e.bg, color: e.fg, borderColor: e.bd }}>{e.txt}</span>
                <div className={`flex flex-col gap-1 ${e.dim ? 'opacity-45' : ''}`}>
                  <div className="flex justify-between font-mono text-[13px] tabular-nums">
                    <span>{fmt(d.current || 0, 1)} <span className="text-[11px] text-muted-foreground">A</span></span>
                    <span>{fmt(d.power || 0, 1)} <span className="text-[11px] text-muted-foreground">kW</span></span>
                  </div>
                  <div className="relative h-2 border" style={{ background: 'var(--bar-track)' }}>
                    <div className="absolute inset-y-0" style={{ left: `${b.bandL}%`, width: `${b.bandW}%`, background: 'var(--bar-band)' }} />
                    <div className="absolute left-0 top-px bottom-px" style={{ width: `${b.pos}%`, background: fill }} />
                  </div>
                </div>
              </a>
            )
          })}
        </div>
        <div className="h-1 mt-2" style={{ background: 'hsl(var(--muted-foreground) / 0.5)' }} aria-hidden />
      </div>
    </section>
  )
})
