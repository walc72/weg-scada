import { memo, useMemo } from 'react'

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
}

const HALF = 113.097

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
}: Props) {

  // ── BIPOLAR MODE ─────────────────────────────────────────────────────────────
  if (bipolar) {
    const absVal = Math.abs(value)
    // color based on |pf|: green ≥ 0.85, yellow ≥ 0.7, red < 0.7
    const arcColor = absVal >= 0.85 ? c1 : absVal >= 0.7 ? c2 : c3

    const half = HALF / 2          // arc length from center to either end
    let fillDasharray = '0 226'
    let fillDashoffset = '0'

    if (value >= 0) {
      // fill from center rightward
      const len = Math.min(value, 1) * half
      fillDasharray = `${len} 226`
      fillDashoffset = `${-half}`    // skip left half, start at center
    } else {
      // fill from center leftward (toward left end)
      const len = Math.min(-value, 1) * half
      const startOffset = half - len // position from left where fill begins
      fillDasharray = `${len} 226`
      fillDashoffset = `${-startOffset}`
    }

    let display: string
    if (value == null || isNaN(value)) display = '0'
    else if (decimals != null) display = value.toFixed(decimals)
    else display = value.toFixed(2)

    // 12-o'clock position (top of arc = center of bipolar scale)
    // circle cx=50 cy=50 r=36 → top point = (50, 14)
    return (
      <div className="text-center">
        <div className="text-[0.7em] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">{label}</div>
        <svg viewBox="0 0 100 58" preserveAspectRatio="xMidYMid meet" className="w-full max-w-[180px] h-auto block mx-auto">
          {/* Background arc — left half (negative) dimmed red */}
          <circle cx="50" cy="50" r="36" fill="none"
            stroke={c3} strokeWidth="7" opacity={0.2}
            strokeDasharray={`${half} 226`} strokeDashoffset={`0`}
            transform="rotate(180,50,50)" strokeLinecap="butt" />
          {/* Background arc — right half (positive) dimmed green */}
          <circle cx="50" cy="50" r="36" fill="none"
            stroke={c1} strokeWidth="7" opacity={0.2}
            strokeDasharray={`${half} 226`} strokeDashoffset={`${-half}`}
            transform="rotate(180,50,50)" strokeLinecap="butt" />
          {/* Value fill */}
          {absVal > 0.005 && (
            <circle cx="50" cy="50" r="36" fill="none" stroke={arcColor} strokeWidth="7"
              strokeDasharray={fillDasharray} strokeDashoffset={fillDashoffset}
              transform="rotate(180,50,50)" strokeLinecap="round" />
          )}
          {/* Center tick at 12 o'clock (top of arc) */}
          <line x1="50" y1="17" x2="50" y2="24" stroke="currentColor" strokeWidth="1.5" opacity={0.5} />
          {/* Value */}
          <text x="50" y="40" textAnchor="middle" fill="currentColor" fontSize="17" fontWeight="700" fontFamily="monospace">{display}</text>
          <text x="50" y="53" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">{unit}</text>
        </svg>
      </div>
    )
  }

  // ── NORMAL MODE ───────────────────────────────────────────────────────────────
  const segs = useMemo(() => {
    const range = Math.max(max - min, 1)
    if (redLow !== undefined) {
      const rlPct = Math.max(0, (redLow - min) / range)
      const gPct  = Math.max(rlPct, (green - min) / range)
      const yPct  = Math.max(gPct,  (yellow - min) / range)
      return [
        { len: rlPct * HALF,           offset: 0,            color: c3, opacity: 0.3 },
        { len: (gPct - rlPct) * HALF,  offset: rlPct * HALF, color: c1, opacity: 0.3 },
        { len: (yPct - gPct) * HALF,   offset: gPct * HALF,  color: c2, opacity: 0.3 },
        { len: (1 - yPct) * HALF,      offset: yPct * HALF,  color: c3, opacity: 0.3 },
      ]
    }
    const gPct = (green - min) / range
    const yPct = (yellow - min) / range
    return [
      { len: gPct * HALF,           offset: 0,           color: c1, opacity: 0.3 },
      { len: (yPct - gPct) * HALF,  offset: gPct * HALF, color: c2, opacity: 0.3 },
      { len: (1 - yPct) * HALF,     offset: yPct * HALF, color: c3, opacity: 0.3 },
    ]
  }, [min, max, redLow, green, yellow, c1, c2, c3])

  const fillLen = Math.max(0, Math.min((value - min) / Math.max(max - min, 1), 1)) * HALF

  const arcColor = invert
    ? (value >= yellow ? c1 : value >= green ? c2 : c3)
    : (redLow !== undefined && value < redLow ? c3 : value <= green ? c1 : value <= yellow ? c2 : c3)

  let display: string
  if (value == null || isNaN(value)) display = '0'
  else if (decimals != null) display = value.toFixed(decimals)
  else if (Math.abs(value) >= 100) display = value.toFixed(0)
  else if (value % 1 !== 0) display = value.toFixed(1)
  else display = value.toString()

  return (
    <div className="text-center">
      <div className="text-[0.7em] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">{label}</div>
      <svg viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet" className="w-full max-w-[180px] h-auto block mx-auto">
        {segs.map((s, i) => (
          <circle key={i} cx="50" cy="50" r="36" fill="none"
            stroke={s.color} strokeWidth="7" opacity={s.opacity}
            strokeDasharray={`${s.len} 226`} strokeDashoffset={`-${s.offset}`}
            transform="rotate(180,50,50)" strokeLinecap="butt" />
        ))}
        {fillLen > 0.5 && (
          <circle cx="50" cy="50" r="36" fill="none" stroke={arcColor} strokeWidth="7"
            strokeDasharray={`${fillLen} 226`} strokeDashoffset="0"
            transform="rotate(180,50,50)" strokeLinecap="round" />
        )}
        <text x="50" y="38" textAnchor="middle" fill="currentColor" fontSize="17" fontWeight="700" fontFamily="monospace">{display}</text>
        <text x="50" y="51" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">{unit}</text>
      </svg>
    </div>
  )
}

export default memo(HalfGauge)
