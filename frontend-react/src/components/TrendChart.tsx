import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea, Brush
} from 'recharts'
import { Card } from './ui/card'
import { ZoomIn, Search, Play } from 'lucide-react'

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
  // Si se provee, el gráfico muestra su PROPIO selector de rango y trae sus
  // datos independientes (rango individual por gráfico).
  rangeFetch?: (from: string, to: string, windowSec: number) => Promise<Record<string, number | string>[]>
}

const RANGE_PRESETS: { key: string; label: string; ms: number }[] = [
  { key: 'global', label: 'Global', ms: 0 },
  { key: '30m', label: '30 min', ms: 30 * 60_000 },
  { key: '6h', label: '6 h', ms: 6 * 3600_000 },
  { key: '24h', label: '24 h', ms: 24 * 3600_000 },
  { key: '48h', label: '48 h', ms: 48 * 3600_000 },
  { key: '7d', label: '7 días', ms: 7 * 86400_000 },
  { key: '30d', label: '30 días', ms: 30 * 86400_000 },
]
function presetToRange(ms: number) {
  const now = Date.now()
  return {
    from: new Date(now - ms).toISOString(),
    to: new Date(now).toISOString(),
    windowSec: Math.min(3600, Math.max(10, Math.round(ms / 1000 / 400))),
  }
}
function toLocalInput(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

export default function TrendChart({ title, data, series, unit, height = 200, yDomain, brush = true, decimals = 2, rangeFetch }: TrendChartProps) {
  const [refLeft, setRefLeft] = useState<number | null>(null)
  const [refRight, setRefRight] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [xDomain, setXDomain] = useState<[number, number] | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [ovKey, setOvKey] = useState('global')
  const [ovData, setOvData] = useState<Record<string, number | string>[] | null>(null)
  const [ovLoading, setOvLoading] = useState(false)
  const [showBrush, setShowBrush] = useState(false)

  function goLive() {
    setOvKey('global'); setOvData(null); setXDomain(null); setShowBrush(false)
  }
  const [cFrom, setCFrom] = useState(() => toLocalInput(Date.now() - 24 * 3600_000))
  const [cTo, setCTo] = useState(() => toLocalInput(Date.now()))

  async function pickRange(key: string) {
    setOvKey(key)
    setXDomain(null)
    if (key === 'custom') return  // muestra los inputs de fecha; espera "Aplicar"
    const preset = RANGE_PRESETS.find(p => p.key === key)
    if (!rangeFetch || !preset || preset.ms === 0) { setOvData(null); return }
    setOvLoading(true)
    try {
      const { from, to, windowSec } = presetToRange(preset.ms)
      setOvData(await rangeFetch(from, to, windowSec))
    } catch { /* ignore */ } finally { setOvLoading(false) }
  }

  async function applyCustom() {
    if (!rangeFetch) return
    const s = new Date(cFrom).getTime(), e = new Date(cTo).getTime()
    if (isNaN(s) || isNaN(e) || e <= s) return
    setXDomain(null)
    setOvLoading(true)
    try {
      const windowSec = Math.min(3600, Math.max(10, Math.round((e - s) / 1000 / 400)))
      setOvData(await rangeFetch(new Date(s).toISOString(), new Date(e).toISOString(), windowSec))
    } catch { /* ignore */ } finally { setOvLoading(false) }
  }

  const baseData = ovData ?? data
  const displayData = xDomain
    ? baseData.filter(d => (d.ts as number) >= xDomain[0] && (d.ts as number) <= xDomain[1])
    : baseData

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

  const lastVal = (key: string): number | null => {
    for (let i = baseData.length - 1; i >= 0; i--) {
      const v = baseData[i][key]
      if (typeof v === 'number' && !isNaN(v)) return v
    }
    return null
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{title}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {xDomain && (
            <button
              onClick={resetZoom}
              className="flex items-center gap-1 text-xs text-primary hover:underline mr-1"
              title="Restablecer zoom"
            >
              <ZoomIn className="h-3 w-3" />
              Reset zoom
            </button>
          )}
          <button
            onClick={() => setShowBrush(true)}
            title="Analizar: selector de rango + barra de navegación"
            className={`p-1 rounded border ${showBrush ? 'bg-primary/15 border-primary/40 text-primary' : 'border-input text-muted-foreground hover:text-foreground'}`}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={goLive}
            title="Tiempo real (datos vivos)"
            className={`p-1 rounded border ${!showBrush ? 'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400' : 'border-input text-muted-foreground hover:text-foreground'}`}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          {rangeFetch && showBrush && (
            <select
              value={ovKey}
              onChange={(e) => pickRange(e.target.value)}
              className="text-[11px] rounded-md border border-input bg-background px-1.5 py-1 text-foreground"
              title="Rango de este gráfico"
            >
              {RANGE_PRESETS.map(p => (
                <option key={p.key} value={p.key}>{p.key === 'global' ? 'Global' : `Ver: ${p.label}`}</option>
              ))}
              <option value="custom">Personalizado…</option>
            </select>
          )}
          {ovLoading && <span className="text-[11px] text-muted-foreground">…</span>}
        </div>
      </div>

      {rangeFetch && showBrush && ovKey === 'custom' && (
        <div className="flex flex-wrap items-end gap-2 mb-2 p-2 rounded-md bg-muted/40 border border-border">
          <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
            Desde
            <input type="datetime-local" value={cFrom} onChange={e => setCFrom(e.target.value)}
              className="text-xs rounded-md border border-input bg-background px-2 py-1 text-foreground" />
          </label>
          <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
            Hasta
            <input type="datetime-local" value={cTo} onChange={e => setCTo(e.target.value)}
              className="text-xs rounded-md border border-input bg-background px-2 py-1 text-foreground" />
          </label>
          <button onClick={applyCustom}
            className="text-xs rounded-md bg-primary text-primary-foreground font-medium px-3 py-1.5 hover:opacity-90">
            Aplicar
          </button>
        </div>
      )}

      <div className="flex gap-3 items-stretch">
      <div className="flex-1 min-w-0">
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
          {brush && showBrush && baseData.length > 1 && (
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
      </div>

      {/* Leyenda con mediciones instantáneas — a la derecha (vertical) */}
      <div className="w-44 shrink-0 self-center flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-0.5">
        {series.map(s => {
          const isHidden = hidden.has(s.key)
          const v = lastVal(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggleSeries(s.key)}
              className="flex items-center gap-1.5 text-left w-full text-xs transition-opacity"
              style={{ opacity: isHidden ? 0.4 : 1 }}
              title={isHidden ? 'Mostrar' : 'Ocultar'}
            >
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-sans font-semibold tabular-nums shrink-0">
                {v == null ? '—' : `${v.toFixed(decimals)}${unit ? ' ' + unit : ''}`}
              </span>
              <span className="font-sans text-muted-foreground truncate">{s.label}</span>
            </button>
          )
        })}
      </div>
      </div>
    </Card>
  )
}
