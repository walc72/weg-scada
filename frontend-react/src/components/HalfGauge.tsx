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
  invert = false
}: Props) {
  // Static: zone background segments — only recalculate when config changes (not on every value update)
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

  // Dynamic: value-dependent calculations — run on every value update
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
