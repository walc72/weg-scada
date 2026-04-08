import { useMemo } from 'react'

interface Props {
  value: number
  label: string
  unit?: string
  min?: number
  max?: number
  green?: number
  yellow?: number
  c1?: string
  c2?: string
  c3?: string
  decimals?: number
  invert?: boolean
}

const HALF = 113.097

export default function HalfGauge({
  value,
  label,
  unit = '',
  min = 0,
  max = 100,
  green = 60,
  yellow = 85,
  c1 = '#22c55e',
  c2 = '#f59e0b',
  c3 = '#ef4444',
  decimals,
  invert = false
}: Props) {
  const { gLen, yLen, rLen, fillLen, arcColor, display, zoneColors } = useMemo(() => {
    const range = Math.max(max - min, 1)
    const gPct = (green - min) / range
    const yPct = (yellow - min) / range
    const vPct = Math.max(0, Math.min((value - min) / range, 1))

    let arc: string
    if (invert) {
      arc = value >= yellow ? c1 : value >= green ? c2 : c3
    } else {
      arc = value <= green ? c1 : value <= yellow ? c2 : c3
    }

    const v = value
    let disp: string
    if (v == null || isNaN(v)) disp = '0'
    else if (decimals != null) disp = v.toFixed(decimals)
    else if (Math.abs(v) >= 100) disp = v.toFixed(0)
    else if (v % 1 !== 0) disp = v.toFixed(1)
    else disp = v.toString()

    return {
      gLen: gPct * HALF,
      yLen: (yPct - gPct) * HALF,
      rLen: (1 - yPct) * HALF,
      fillLen: vPct * HALF,
      arcColor: arc,
      display: disp,
      zoneColors: invert ? [c3, c2, c1] : [c1, c2, c3]
    }
  }, [value, min, max, green, yellow, c1, c2, c3, decimals, invert])

  return (
    <div className="text-center">
      <div className="text-[0.7em] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">{label}</div>
      <svg viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet" className="w-full max-w-[180px] h-auto block mx-auto">
        <circle cx="50" cy="50" r="36" fill="none" stroke={zoneColors[0]} strokeWidth="7" opacity="0.3"
          strokeDasharray={`${gLen} 226`} strokeDashoffset="0" transform="rotate(180,50,50)" strokeLinecap="butt" />
        <circle cx="50" cy="50" r="36" fill="none" stroke={zoneColors[1]} strokeWidth="7" opacity="0.3"
          strokeDasharray={`${yLen} 226`} strokeDashoffset={`-${gLen}`} transform="rotate(180,50,50)" strokeLinecap="butt" />
        <circle cx="50" cy="50" r="36" fill="none" stroke={zoneColors[2]} strokeWidth="7" opacity="0.3"
          strokeDasharray={`${rLen} 226`} strokeDashoffset={`-${gLen + yLen}`} transform="rotate(180,50,50)" strokeLinecap="butt" />
        {fillLen > 0.5 && (
          <circle cx="50" cy="50" r="36" fill="none" stroke={arcColor} strokeWidth="7"
            strokeDasharray={`${fillLen} 226`} strokeDashoffset="0" transform="rotate(180,50,50)" strokeLinecap="round" />
        )}
        <text x="50" y="38" textAnchor="middle" fill="currentColor" fontSize="17" fontWeight="700" fontFamily="monospace">{display}</text>
        <text x="50" y="51" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">{unit}</text>
      </svg>
    </div>
  )
}
