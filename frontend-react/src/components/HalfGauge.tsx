import { memo } from 'react'

// Indicador de barra estilo ISA-101 (antes semicírculo; se conserva el nombre y
// las props para no tocar a los que lo usan). Gris mientras el valor está en la
// banda normal; amarillo / rojo solo cuando sale de zona.
interface Props {
  value: number
  label: string
  unit?: string
  min?: number
  max?: number
  redLow?: number
  green?: number
  yellow?: number
  c1?: string
  c2?: string
  c3?: string
  decimals?: number
  invert?: boolean
  bipolar?: boolean   // -1..+1 (factor de potencia): se mide la magnitud
  suffix?: string     // etiqueta junto al valor (ej. 'i'/'c' inductivo/capacitivo)
  plain?: boolean     // sin coloración por umbrales
  stale?: boolean     // datos viejos: en gris
  big?: boolean       // tamaño destacado (hero)
  escala?: boolean    // mínimo · banda normal · máximo debajo de la barra
}

type Nivel = 'ok' | 'warn' | 'bad'

function fmtValue(v: number, decimals?: number): string {
  if (v == null || isNaN(v)) return '0'
  if (decimals != null) return v.toFixed(decimals)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (v % 1 !== 0) return v.toFixed(1)
  return v.toString()
}

// Zonas → banda normal, marcas de límite y nivel del valor. Exportada para el test.
export function barra(p: { value: number; min: number; max: number; redLow?: number; green: number; yellow: number; invert?: boolean; bipolar?: boolean }) {
  const minV = p.bipolar ? 0 : p.min
  const maxV = p.bipolar ? 1 : p.max
  const span = maxV - minV || 1
  const clamp = (v: number) => Math.max(minV, Math.min(maxV, Number.isFinite(v) ? v : maxV))
  const pct = (v: number) => (clamp(v) - minV) / span * 100
  const raw = Number.isFinite(p.value) ? p.value : 0
  const v = p.bipolar ? Math.abs(raw) : raw

  if (p.bipolar) {
    const nivel: Nivel = v >= 0.85 ? 'ok' : v >= 0.7 ? 'warn' : 'bad'
    return { pos: pct(v), bandL: pct(0.85), bandW: 100 - pct(0.85), warnAt: [pct(0.85)], badAt: [pct(0.7)], nivel }
  }
  const redLow = p.redLow !== undefined ? clamp(p.redLow) : undefined
  const green = clamp(p.green)
  const yellow = Math.max(green, clamp(p.yellow))
  if (p.invert) {
    const nivel: Nivel = v >= yellow ? 'ok' : v >= green ? 'warn' : 'bad'
    return { pos: pct(v), bandL: pct(yellow), bandW: 100 - pct(yellow), warnAt: [pct(yellow)], badAt: [pct(green)], nivel }
  }
  const lo = redLow ?? minV
  const nivel: Nivel = (redLow !== undefined && v < redLow) ? 'bad' : v <= green ? 'ok' : v <= yellow ? 'warn' : 'bad'
  return {
    pos: pct(v), bandL: pct(lo), bandW: pct(green) - pct(lo),
    warnAt: [pct(green)], badAt: redLow !== undefined ? [pct(redLow), pct(yellow)] : [pct(yellow)], nivel
  }
}

const FILL: Record<Nivel, string> = { ok: 'var(--bar-fill)', warn: 'var(--p3)', bad: 'var(--p1)' }

function HalfGauge({
  value, label, unit = '', min = 0, max = 100, redLow, green = 60, yellow = 85,
  decimals, invert = false, bipolar = false, suffix = '', plain = false, stale = false, big = false, escala = false,
}: Props) {
  const b = barra({ value, min, max, redLow, green, yellow, invert, bipolar })
  const nivel: Nivel = stale || plain ? 'ok' : b.nivel
  const shown = bipolar ? Math.max(-1, Math.min(1, value || 0)) : (value || 0)
  const display = fmtValue(shown, bipolar ? (decimals ?? 2) : decimals)
  const marcas = !stale && !plain

  return (
    <div className="text-left min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider truncate">{label}</span>
        <span
          className={`font-mono font-medium leading-none tabular-nums whitespace-nowrap px-1 ${big ? 'text-2xl' : 'text-lg'}`}
          style={nivel === 'ok'
            ? { color: stale ? 'hsl(var(--muted-foreground))' : undefined }
            : { background: FILL[nivel], color: '#16191C' }}
        >
          {display}
          {unit && <span className={`text-xs font-normal ml-1 ${nivel === 'ok' ? 'text-muted-foreground' : ''}`}>{unit}</span>}
          {suffix && (
            <span className="text-xs font-bold ml-1"
              title={suffix === 'i' ? 'Inductivo (atraso)' : suffix === 'c' ? 'Capacitivo (adelanto)' : undefined}>
              {suffix}
            </span>
          )}
        </span>
      </div>
      <div className={`relative mt-1.5 border border-border ${big ? 'h-3' : 'h-2.5'}`} style={{ background: 'var(--bar-track)' }}
        role="meter" aria-label={label} aria-valuenow={shown} aria-valuemin={bipolar ? -1 : min} aria-valuemax={bipolar ? 1 : max}>
        {marcas && <div className="absolute inset-y-0" style={{ left: `${b.bandL}%`, width: `${b.bandW}%`, background: 'var(--bar-band)' }} />}
        <div className="absolute left-0 top-px bottom-px transition-[width] duration-500"
          style={{ width: `${b.pos}%`, background: stale ? 'var(--bar-stale)' : FILL[nivel] }} />
        {marcas && b.warnAt.map((x, i) => <div key={'w' + i} className="absolute -top-1 -bottom-1 w-0.5" style={{ left: `${x}%`, background: 'var(--lim)' }} />)}
        {marcas && b.badAt.map((x, i) => <div key={'b' + i} className="absolute -top-1 -bottom-1 w-0.5" style={{ left: `${x}%`, background: 'var(--p1)' }} />)}
      </div>
      {escala && (
        <div className="flex justify-between mt-1 font-mono text-[10px] text-muted-foreground">
          <span>{fmtNum(bipolar ? 0 : min)}</span>
          <span>normal {bipolar ? '0,85–1' : invert ? `${fmtNum(yellow)}–${fmtNum(max)}` : `${fmtNum(redLow ?? min)}–${fmtNum(green)}`}</span>
          <span>{fmtNum(bipolar ? 1 : max)}</span>
        </div>
      )}
    </div>
  )
}

const fmtNum = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 2 })

export default memo(HalfGauge)
