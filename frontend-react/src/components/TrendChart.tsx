import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea, Brush
} from 'recharts'
import { Card } from './ui/card'
import { ZoomIn } from 'lucide-react'

export interface SeriesDef {
  key: string
  label: string
  color: string
}

interface TrendChartProps {
  title: string
  data: Record<string, number | string>[]
  series: SeriesDef[]
  unit?: string
  height?: number
  yDomain?: [number | 'auto', number | 'auto']
  brush?: boolean
  decimals?: number
}

function pad(n: number) { return n.toString().padStart(2, '0') }

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Eje X consciente del rango: si abarca días muestra fecha; si abarca minutos,
// HH:MM; si es de segundos, HH:MM:SS.
function makeAxisFmt(spanMs: number) {
  if (spanMs >= 36 * 3600_000) return (ts: number) => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` }
  if (spanMs >= 6 * 3600_000)  return (ts: number) => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h` }
  if (spanMs >= 3 * 60_000)    return (ts: number) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
  return fmtTime
}

// Tooltip: fecha completa para no ambigüedad
function fmtFull(ts: number) {
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getTickCount(dataLen: number) {
  if (dataLen <= 10) return dataLen
  if (dataLen <= 30) return 5
  return 6
}

function RotatedTick({ x, y, payload, fmt }: { x?: number; y?: number; payload?: { value: number }; fmt?: (ts: number) => string }) {
  if (x == null || y == null || payload == null) return null
  return (
    <text x={x} y={y + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.6}
      transform={`rotate(-30, ${x}, ${y})`}>
      {(fmt ?? fmtTime)(payload.value)}
    </text>
  )
}

export default function TrendChart({ title, data, series, unit, height = 200, yDomain, brush = true, decimals = 2 }: TrendChartProps) {
  const [refLeft, setRefLeft] = useState<number | null>(null)
  const [refRight, setRefRight] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [xDomain, setXDomain] = useState<[number, number] | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const displayData = xDomain
    ? data.filter(d => (d.ts as number) >= xDomain[0] && (d.ts as number) <= xDomain[1])
    : data

  const spanMs = displayData.length > 1
    ? (displayData[displayData.length - 1].ts as number) - (displayData[0].ts as number)
    : 0
  const axisFmt = makeAxisFmt(spanMs)

  function toggleSeries(key: string) {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function onMouseDown(e: { activeLabel?: string | number }) {
    const val = e?.activeLabel != null ? Number(e.activeLabel) : null
    if (val == null || isNaN(val)) return
    setRefLeft(val)
    setRefRight(null)
    setSelecting(true)
  }

  function onMouseMove(e: { activeLabel?: string | number }) {
    if (!selecting) return
    const val = e?.activeLabel != null ? Number(e.activeLabel) : null
    if (val == null || isNaN(val)) return
    setRefRight(val)
  }

  function onMouseUp() {
    if (!selecting) return
    setSelecting(false)
    if (refLeft != null && refRight != null && refLeft !== refRight) {
      const [l, r] = refLeft < refRight ? [refLeft, refRight] : [refRight, refLeft]
      setXDomain([l, r])
    }
    setRefLeft(null)
    setRefRight(null)
  }

  function resetZoom() {
    setXDomain(null)
    setRefLeft(null)
    setRefRight(null)
    setSelecting(false)
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        {xDomain && (
          <button
            onClick={resetZoom}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
            title="Restablecer zoom"
          >
            <ZoomIn className="h-3 w-3" />
            Reset zoom
          </button>
        )}
      </div>

      {/* Custom legend with toggles */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
        {series.map(s => {
          const isHidden = hidden.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggleSeries(s.key)}
              className="flex items-center gap-1.5 text-[10px] transition-opacity"
              style={{ opacity: isHidden ? 0.35 : 1 }}
            >
              <span
                className="inline-block w-4 h-0.5 rounded-full"
                style={{ backgroundColor: s.color, height: 2 }}
              />
              <span>{s.label}</span>
            </button>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={displayData}
          margin={{ top: 2, right: 8, left: -10, bottom: 0 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{ userSelect: 'none', cursor: selecting ? 'col-resize' : 'crosshair' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={axisFmt}
            tick={<RotatedTick fmt={axisFmt} />}
            tickCount={getTickCount(displayData.length)}
            height={36}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            domain={yDomain ?? ['auto', 'auto']}
            unit={unit ? ` ${unit}` : undefined}
            tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(decimals) : v)}
            width={55}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          {!selecting && (
            <Tooltip
              labelFormatter={(v) => fmtFull(v as number)}
              formatter={(v: number, name) => [`${v.toFixed(decimals)} ${unit ?? ''}`, name]}
              contentStyle={{ fontSize: 11, borderRadius: 6, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
              itemStyle={{ color: 'inherit' }}
            />
          )}
          {series.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              strokeWidth={1.8}
              isAnimationActive={false}
              connectNulls
              hide={hidden.has(s.key)}
            />
          ))}
          {selecting && refLeft != null && refRight != null && (
            <ReferenceArea
              x1={Math.min(refLeft, refRight)}
              x2={Math.max(refLeft, refRight)}
              strokeOpacity={0.3}
              fill="#3b82f6"
              fillOpacity={0.2}
            />
          )}
          {brush && data.length > 1 && (
            <Brush
              dataKey="ts"
              height={20}
              tickFormatter={fmtTime}
              travellerWidth={6}
              fill="transparent"
              stroke="currentColor"
              strokeOpacity={0.2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
