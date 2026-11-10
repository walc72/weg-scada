import { useState, useEffect, useRef, useContext, createContext } from 'react'
import {
  ResponsiveContainer, LineChart, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea, Brush
} from 'recharts'
import { Card } from './ui/card'
import { ZoomIn, Search, Play, ChevronRight, ChevronLeft, Maximize2, X, Clock, Loader2, Download } from 'lucide-react'
import { descargarCSV, fechaTexto } from '../lib/csv'
import { downloadXlsx } from '../lib/xlsx'
import { filasGrafico, nombreExport } from '../lib/exportar'
import { ultimoValor } from '@/lib/stale'
import { useNow } from '@/lib/useNow'

// ¿El período de la página llega hasta ahora? Históricos lo pone en false con un rango pasado,
// para que la leyenda no marque como viejos datos que lo son a propósito.
export const TendenciaEnVivo = createContext(true)

// Los colores de las series vienen de lib/paleta (cada vista elige fase, magnitud o serie).

// Botones de la cabecera: mismo alto y letra que el resto del portal
const BTN = 'inline-flex items-center gap-1 px-2 min-h-[26px] text-[11px] font-semibold tracking-wider border border-border'
const BTN_ON = 'bg-foreground text-background'
const BTN_OFF = 'bg-background text-muted-foreground hover:text-foreground hover:bg-accent'

export interface SeriesDef {
  key: string
  label: string
  color: string
  line?: boolean  // en un gráfico apilado: línea (p.ej. Total) en vez de área
  dashed?: boolean // línea punteada (consignas)
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
  // Línea escalonada (conteos/estados, ej. bombas en marcha) en vez de curva
  step?: boolean
  // Áreas apiladas (las series con `line` se dibujan como línea encima)
  stacked?: boolean
  yWidth?: number  // ancho del eje Y (unidades largas como m³/h)
  fill?: boolean   // ocupa el alto del contenedor (p.ej. al lado de otro panel)
}

const RANGE_PRESETS: { key: string; label: string; ms: number }[] = [
  { key: 'global', label: 'Período de la página', ms: 0 },
  { key: '30m', label: '30 min', ms: 30 * 60_000 },
  { key: '1h', label: '1 h', ms: 3600_000 },
  { key: '6h', label: '6 h', ms: 6 * 3600_000 },
  { key: '12h', label: '12 h', ms: 12 * 3600_000 },
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

function TickTiempo({ x, y, payload, fmt }: { x?: number; y?: number; payload?: { value: number }; fmt?: (ts: number) => string }) {
  if (x == null || y == null || payload == null) return null
  return (
    <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fontFamily="IBM Plex Mono, monospace" fill="hsl(var(--muted-foreground))">
      {(fmt ?? fmtTime)(payload.value)}
    </text>
  )
}

export default function TrendChart({ title, data, series, unit, height = 200, yDomain, brush = true, decimals = 0, rangeFetch, step = false, stacked = false, yWidth = 55, fill = false }: TrendChartProps) {
  const Chart = stacked ? ComposedChart : LineChart
  const [refLeft, setRefLeft] = useState<number | null>(null)
  const [refRight, setRefRight] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [xDomain, setXDomain] = useState<[number, number] | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [ovKey, setOvKey] = useState('global')
  const [ovData, setOvData] = useState<Record<string, number | string>[] | null>(null)
  const [ovLoading, setOvLoading] = useState(false)
  const [showBrush, setShowBrush] = useState(false)
  // En pantallas angostas (celular) arranca plegada para dejar el ancho al gráfico
  const [legendOpen, setLegendOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640)
  const [expanded, setExpanded] = useState(false)
  const [menuExp, setMenuExp] = useState(false)
  const expRef = useRef<HTMLDivElement>(null)

  // Menú EXPORTAR: cierra con clic afuera o Esc (en pantalla completa, el Esc cierra solo el menú)
  useEffect(() => {
    if (!menuExp) return
    const onDown = (e: MouseEvent) => { if (!expRef.current?.contains(e.target as Node)) setMenuExp(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuExp(false) } }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [menuExp])
  const paginaEnVivo = useContext(TendenciaEnVivo)
  const ahora = useNow(15_000)  // reevalúa la antigüedad aunque no lleguen datos

  // En pantalla completa: cerrar con Esc
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

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

  // Período propio (no personalizado): se vuelve a leer cada minuto para seguir al día.
  // rangeFetch va por ref: el padre lo recrea en cada render y reiniciaría el intervalo.
  const fetchRef = useRef(rangeFetch)
  fetchRef.current = rangeFetch
  useEffect(() => {
    const preset = RANGE_PRESETS.find(p => p.key === ovKey)
    if (!preset || preset.ms === 0 || xDomain || showBrush) return
    const id = setInterval(() => {
      const f = fetchRef.current
      if (!f) return
      const { from, to, windowSec } = presetToRange(preset.ms)
      f(from, to, windowSec).then(setOvData).catch(() => { /* se mantiene lo último */ })
    }, 60_000)
    return () => clearInterval(id)
  }, [ovKey, xDomain, showBrush])

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

  function exportar(ext: 'csv' | 'xlsx') {
    setMenuExp(false)
    const { headers, rows } = filasGrafico(displayData, series.filter(s => !hidden.has(s.key)), unit)
    const nombre = nombreExport(title, new Date(), ext)
    if (ext === 'csv') return descargarCSV(nombre, headers, rows)
    downloadXlsx(nombre, [{ name: title.slice(0, 31) || 'Datos', headers, rows: rows.map(([d, ...v]) => [fechaTexto(d as Date), ...(v as (number | null)[])]) }])
  }

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

  // Leyenda: sin dato fresco, «—». Solo cuando el gráfico sigue al presente
  // (período propio «Últ. …» o el de la página si está en vivo); ANALIZAR o un rango fijo no se marcan.
  const enVivo = !showBrush && ovKey !== 'custom' && (ovKey !== 'global' || paginaEnVivo)
  const lastVal = (key: string) => ultimoValor(baseData, key, enVivo ? ahora : null)

  return (
    <Card className={expanded ? 'p-4 fixed inset-0 z-50 rounded-none flex flex-col overflow-auto' : fill ? 'p-4 h-full flex flex-col' : 'p-4'}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs font-bold tracking-widest uppercase truncate">{title}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {xDomain && (
            <button onClick={resetZoom} title="Restablecer zoom" className={`${BTN} ${BTN_OFF}`}>
              <ZoomIn className="h-3 w-3" />SIN ZOOM
            </button>
          )}
          {/* Período propio de este gráfico (o el de la página); resaltado cuando difiere de la página */}
          {rangeFetch && (
            <label className="inline-flex items-center gap-1" title="Período de este gráfico">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <select value={ovKey} onChange={(e) => pickRange(e.target.value)} aria-label="Período de este gráfico"
                className={`text-[11px] font-semibold border px-1.5 min-h-[26px] ${ovKey === 'global' ? 'border-border bg-background text-muted-foreground' : 'border-foreground bg-accent text-foreground'}`}>
                {RANGE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.key === 'global' ? p.label : `Últ. ${p.label}`}</option>)}
                <option value="custom">Personalizado…</option>
              </select>
            </label>
          )}
          {/* Modo: EN VIVO (sigue los datos) / ANALIZAR (rango y barra de navegación) */}
          <div role="group" aria-label="Modo del gráfico" className="inline-flex border border-border">
            <button onClick={goLive} aria-pressed={!showBrush} title="Tiempo real (datos vivos)"
              className={`${BTN} border-0 ${!showBrush ? BTN_ON : BTN_OFF}`}>
              <Play className="h-3 w-3" />EN VIVO
            </button>
            <button onClick={() => setShowBrush(true)} aria-pressed={showBrush} title="Analizar: selector de rango + barra de navegación"
              className={`${BTN} border-0 ${showBrush ? BTN_ON : BTN_OFF}`}>
              <Search className="h-3 w-3" />ANALIZAR
            </button>
          </div>
          {displayData.length > 0 && (
            <div ref={expRef} className="relative">
              <button onClick={() => setMenuExp(v => !v)} aria-haspopup="menu" aria-expanded={menuExp}
                title="Exportar (CSV/XLSX) los puntos que se ven en el gráfico" aria-label="Exportar datos del gráfico"
                className={`${BTN} ${menuExp ? BTN_ON : BTN_OFF} px-1.5`}>
                <Download className="h-3.5 w-3.5" />
              </button>
              {menuExp && (
                <div role="menu" className="absolute right-0 top-full mt-1 z-20 flex flex-col min-w-[96px] border border-border bg-background">
                  {(['csv', 'xlsx'] as const).map(ext => (
                    <button key={ext} role="menuitem" onClick={() => exportar(ext)}
                      className={`${BTN} border-0 ${BTN_OFF} justify-start`}>
                      {ext.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={() => setExpanded(v => !v)} title={expanded ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
            aria-label={expanded ? 'Salir de pantalla completa' : 'Pantalla completa'} className={`${BTN} ${BTN_OFF} px-1.5`}>
            {expanded ? <X className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {ovLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Cargando" />}
        </div>
      </div>

      {rangeFetch && ovKey === 'custom' && (
        <div className="flex flex-wrap items-end gap-2 mb-2 p-2 bg-muted/40 border border-border">
          <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
            Desde
            <input type="datetime-local" value={cFrom} onChange={e => setCFrom(e.target.value)}
              className="text-xs border border-border bg-background px-2 min-h-[28px] font-mono text-foreground" />
          </label>
          <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
            Hasta
            <input type="datetime-local" value={cTo} onChange={e => setCTo(e.target.value)}
              className="text-xs border border-border bg-background px-2 min-h-[28px] font-mono text-foreground" />
          </label>
          <button onClick={applyCustom}
            className="text-[11px] font-semibold tracking-wider bg-primary text-primary-foreground px-3 min-h-[28px] hover:opacity-90">
            APLICAR
          </button>
        </div>
      )}

      <div className={`flex gap-3 items-stretch ${expanded || fill ? 'flex-1 min-h-0' : ''}`} style={fill && !expanded ? { minHeight: height } : undefined}>
      <div className={`flex-1 min-w-0 ${expanded ? 'min-h-0' : ''}`}>
      <ResponsiveContainer key={expanded ? 'fs' : 'n'} width="100%" height={expanded || fill ? '100%' : height}>
        <Chart
          data={displayData}
          margin={{ top: 2, right: 30, left: -4, bottom: 0 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{ userSelect: 'none', cursor: selecting ? 'col-resize' : 'crosshair' }}
        >
          {/* Grilla solo horizontal y tenue: los datos mandan */}
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.9} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={axisFmt}
            tick={<TickTiempo fmt={axisFmt} />}
            tickCount={getTickCount(displayData.length)}
            height={24}
            minTickGap={18}
            interval="preserveStartEnd"
            stroke="hsl(var(--border))"
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', fill: 'hsl(var(--muted-foreground))' }}
            domain={yDomain ?? ['auto', 'auto']}
            allowDecimals={decimals > 0}
            tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(decimals) : v)}
            width={yWidth}
            axisLine={false}
            tickLine={false}
          />
          {!selecting && (
            <Tooltip
              labelFormatter={(v) => fmtFull(v as number)}
              formatter={(v, name) => [`${Number(v).toFixed(decimals)} ${unit ?? ''}`, String(name ?? '')]}
              itemSorter={(it) => -(Number(it.value) || 0)}
              cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{ fontSize: 11, borderRadius: 2, padding: '6px 8px', background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))', fontFamily: 'IBM Plex Mono, monospace' }}
              labelStyle={{ fontFamily: 'IBM Plex Sans, sans-serif', fontWeight: 600, marginBottom: 2 }}
              itemStyle={{ color: 'inherit', padding: 0 }}
            />
          )}
          {series.map(s => stacked && !s.line ? (
            <Area
              key={s.key}
              type={step ? 'stepAfter' : 'monotone'}
              dataKey={s.key}
              name={s.label}
              stackId="stack"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.45}
              strokeWidth={1.2}
              isAnimationActive={false}
              hide={hidden.has(s.key)}
            />
          ) : (
            <Line
              key={s.key}
              type={step ? 'stepAfter' : 'monotone'}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              strokeWidth={1.6}
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
              fill="hsl(var(--primary))"
              fillOpacity={0.15}
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
        </Chart>
      </ResponsiveContainer>
      </div>

      {/* Leyenda con mediciones instantáneas — colapsable a la derecha */}
      <div className="shrink-0 self-stretch flex items-start border-l pl-2">
        <button
          onClick={() => setLegendOpen(v => !v)}
          className="shrink-0 self-center border border-border text-muted-foreground hover:text-foreground hover:bg-accent p-0.5"
          title={legendOpen ? 'Ocultar leyenda' : 'Mostrar leyenda'}
          aria-label={legendOpen ? 'Ocultar leyenda' : 'Mostrar leyenda'}
        >
          {legendOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        {legendOpen && (
          <div className="w-44 self-center flex flex-col gap-1 max-h-[260px] overflow-y-auto scrollbar-thin pr-0.5 pl-2">
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
                  <span className="inline-block w-3 h-[3px] shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="font-mono font-medium tabular-nums shrink-0 min-w-18 text-right" style={v == null ? { color: 'var(--bar-stale)' } : undefined}>
                    {v == null ? '—' : `${v.toFixed(decimals)}${unit ? ' ' + unit : ''}`}
                  </span>
                  <span className="text-muted-foreground truncate">{s.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </Card>
  )
}
