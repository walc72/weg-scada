import { memo, useMemo, useState, useRef, useEffect } from 'react'

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
  bipolar?: boolean   // -1..+1, fill from center
  stale?: boolean     // datos viejos: gauge en gris
  big?: boolean       // tamaño destacado (hero)
}

const HALF = 113.097          // longitud del semicírculo (π·r, r=36)
const REST = 226              // resto de la circunferencia (para el gap del dash)
const GREY = '#9ca3af'

// Interpola suavemente `target` (easeOutCubic ~450ms) para que el gauge se
// mueva como un instrumento real en vez de saltar de golpe.
function useTween(target: number, duration = 450): number {
  const safe = Number.isFinite(target) ? target : 0
  const [val, setVal] = useState(safe)
  const raf = useRef<number>()
  const from = useRef(safe)
  useEffect(() => {
    const start = performance.now()
    const origin = from.current
    const delta = safe - origin
    if (Math.abs(delta) < 1e-6) { setVal(safe); from.current = safe; return }
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      const next = origin + delta * eased
      setVal(next)
      from.current = next
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe, duration])
  return val
}

function fmtValue(v: number, decimals?: number): string {
  if (v == null || isNaN(v)) return '0'
  if (decimals != null) return v.toFixed(decimals)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (v % 1 !== 0) return v.toFixed(1)
  return v.toString()
}

function HalfGauge({
  value,
  label,
  unit = '',
  min = 0,
  max = 100,
  redLow,
  green = 60,
  yellow = 85,
  c1 = '#22c55e',
  c2 = '#f59e0b',
  c3 = '#ef4444',
  decimals,
  invert = false,
  bipolar = false,
  stale = false,
  big = false,
}: Props) {

  const animated = useTween(value)
  const svgCls = big ? 'w-full max-w-[240px] h-auto block mx-auto' : 'w-full max-w-[180px] h-auto block mx-auto'

  // ── BIPOLAR MODE (factor de potencia) ─────────────────────────────────────
  if (bipolar) {
    const absVal = Math.abs(animated)
    const arcColor = stale ? GREY : absVal >= 0.85 ? c1 : absVal >= 0.7 ? c2 : c3
    const half = HALF / 2

    let fillDasharray = `0 ${REST}`
    let fillDashoffset = '0'
    if (animated >= 0) {
      const len = Math.min(animated, 1) * half
      fillDasharray = `${len} ${REST}`
      fillDashoffset = `${-half}`
    } else {
      const len = Math.min(-animated, 1) * half
      fillDasharray = `${len} ${REST}`
      fillDashoffset = `${-(half - len)}`
    }

    const display = fmtValue(animated, decimals ?? 2)

    return (
      <div className="text-center">
        <div className="text-[0.7em] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">{label}</div>
        <svg viewBox="0 0 100 58" preserveAspectRatio="xMidYMid meet" className={svgCls}>
          <circle cx="50" cy="50" r="36" fill="none" stroke={c3} strokeWidth="7" opacity={0.18}
            strokeDasharray={`${half} ${REST}`} strokeDashoffset="0"
            transform="rotate(180,50,50)" strokeLinecap="butt" />
          <circle cx="50" cy="50" r="36" fill="none" stroke={c1} strokeWidth="7" opacity={0.18}
            strokeDasharray={`${half} ${REST}`} strokeDashoffset={`${-half}`}
            transform="rotate(180,50,50)" strokeLinecap="butt" />
          {absVal > 0.005 && (
            <circle cx="50" cy="50" r="36" fill="none" stroke={arcColor} strokeWidth="7"
              strokeDasharray={fillDasharray} strokeDashoffset={fillDashoffset}
              transform="rotate(180,50,50)" strokeLinecap="round" />
          )}
          {/* Marca de centro (12 en punto) */}
          <line x1="50" y1="17" x2="50" y2="24" stroke="currentColor" strokeWidth="1.5" opacity={0.5} />
          <text x="50" y="40" textAnchor="middle" fill={stale ? GREY : 'currentColor'} fontSize="18" fontWeight="700" fontFamily="monospace">{display}</text>
          <text x="50" y="53" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">{unit}</text>
        </svg>
      </div>
    )
  }

  // ── NORMAL MODE ────────────────────────────────────────────────────────────
  const range = Math.max(max - min, 1)

  const segs = useMemo(() => {
    if (redLow !== undefined) {
      const rlPct = Math.max(0, (redLow - min) / range)
      const gPct  = Math.max(rlPct, (green - min) / range)
      const yPct  = Math.max(gPct,  (yellow - min) / range)
      return [
        { len: rlPct * HALF,           offset: 0,            color: c3, opacity: 0.28 },
        { len: (gPct - rlPct) * HALF,  offset: rlPct * HALF, color: c1, opacity: 0.28 },
        { len: (yPct - gPct) * HALF,   offset: gPct * HALF,  color: c2, opacity: 0.28 },
        { len: (1 - yPct) * HALF,      offset: yPct * HALF,  color: c3, opacity: 0.28 },
      ]
    }
    const gPct = (green - min) / range
    const yPct = (yellow - min) / range
    return [
      { len: gPct * HALF,           offset: 0,           color: c1, opacity: 0.28 },
      { len: (yPct - gPct) * HALF,  offset: gPct * HALF, color: c2, opacity: 0.28 },
      { len: (1 - yPct) * HALF,     offset: yPct * HALF, color: c3, opacity: 0.28 },
    ]
  }, [min, range, redLow, green, yellow, c1, c2, c3])

  // Marcas de umbral (tick fino oscuro en cada frontera de zona). Reutiliza la
  // misma geometría del arco: un dash cortito en el offset de la frontera.
  const ticks = useMemo(() => {
    const bounds = redLow !== undefined ? [redLow, green, yellow] : [green, yellow]
    return bounds
      .map(b => (b - min) / range)
      .filter(p => p > 0.02 && p < 0.98)
      .map(p => p * HALF)
  }, [min, range, redLow, green, yellow])

  const fillLen = Math.max(0, Math.min((animated - min) / range, 1)) * HALF

  const arcColor = stale
    ? GREY
    : invert
    ? (animated >= yellow ? c1 : animated >= green ? c2 : c3)
    : (redLow !== undefined && animated < redLow ? c3 : animated <= green ? c1 : animated <= yellow ? c2 : c3)

  const display = fmtValue(animated, decimals)

  return (
    <div className="text-center">
      <div className="text-[0.7em] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">{label}</div>
      <svg viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet" className={svgCls}>
        {/* Zonas (verde/amarillo/rojo) */}
        {segs.map((s, i) => (
          <circle key={i} cx="50" cy="50" r="36" fill="none"
            stroke={s.color} strokeWidth="7" opacity={stale ? 0.12 : s.opacity}
            strokeDasharray={`${s.len} ${REST}`} strokeDashoffset={`-${s.offset}`}
            transform="rotate(180,50,50)" strokeLinecap="butt" />
        ))}
        {/* Relleno del valor */}
        {fillLen > 0.5 && (
          <circle cx="50" cy="50" r="36" fill="none" stroke={arcColor} strokeWidth="7"
            strokeDasharray={`${fillLen} ${REST}`} strokeDashoffset="0"
            transform="rotate(180,50,50)" strokeLinecap="round" />
        )}
        {/* Marcas de umbral */}
        {!stale && ticks.map((t, i) => (
          <circle key={`t${i}`} cx="50" cy="50" r="36" fill="none"
            stroke="currentColor" strokeWidth="7" opacity={0.35}
            strokeDasharray={`0.8 ${REST}`} strokeDashoffset={`-${t}`}
            transform="rotate(180,50,50)" strokeLinecap="butt" />
        ))}
        <text x="50" y="38" textAnchor="middle" fill={stale ? GREY : 'currentColor'} fontSize="18" fontWeight="700" fontFamily="monospace">{display}</text>
        <text x="50" y="51" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">{unit}</text>
      </svg>
    </div>
  )
}

export default memo(HalfGauge)
