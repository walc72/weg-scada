import { SkeletonBloque } from '../ui/skeleton'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { apiJson } from '../../lib/api'
import { serieDe } from '../../lib/tendencia'
import type { Grafico, Series } from '../../lib/tendencia'
import type { Nodo } from '../../lib/unifilar'
import type { AppConfig } from '../../types'
import { SERIE_NEUTRA } from '../TrendChart'

const RANGOS = [
  { id: '-1h', label: '1 H', windowSec: 60 },
  { id: '-6h', label: '6 H', windowSec: 300 },
  { id: '-24h', label: '24 H', windowSec: 900 },
]
const hora = (ts: number) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
const num = (v: number, d = 1) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
const MONO = { fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', fill: 'hsl(var(--muted-foreground))' }
const seg = (activo: boolean) => `px-2.5 min-h-[28px] text-[11px] font-semibold tracking-wider ${activo ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`

// último · mínimo · promedio · máximo de una serie de una sola línea
function resumen(g: Grafico) {
  const k = g.lineas[0]?.key
  const v = g.datos.map(p => p[k]).filter((x): x is number => typeof x === 'number')
  return v.length ? { ult: v[v.length - 1], min: Math.min(...v), prom: v.reduce((a, b) => a + b, 0) / v.length, max: Math.max(...v) } : null
}

function Grafiquito({ g }: { g: Grafico }) {
  const dec = g.dec ?? 1
  const una = g.lineas.length === 1
  const r = una && !g.escalon ? resumen(g) : null
  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={g.datos} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          {/* grilla solo horizontal y tenue, como en Tendencias */}
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.9} />
          <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={hora} tick={MONO}
            minTickGap={24} interval="preserveStartEnd" stroke="hsl(var(--border))" tickLine={false} height={20} />
          <YAxis tick={MONO} axisLine={false} tickLine={false} width={44} allowDecimals={!g.escalon}
            tickFormatter={(v: number) => num(v, g.escalon ? 0 : Math.min(dec, 2))}
            domain={g.escalon ? [(m: number) => Math.floor(m) - 1, (m: number) => Math.ceil(m) + 1] : ['auto', 'auto']} />
          <Tooltip labelFormatter={v => hora(Number(v))} formatter={(v, k) => [`${num(Number(v), g.escalon ? 0 : dec)}${g.unidad && ` ${g.unidad}`}`, String(k)]}
            cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }}
            contentStyle={{ fontSize: 11, borderRadius: 2, padding: '6px 8px', background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))', fontFamily: 'IBM Plex Mono, monospace' }}
            itemStyle={{ color: 'inherit', padding: 0 }} />
          {g.lineas.map(l => (
            <Line key={l.key} dataKey={l.key} stroke={una ? SERIE_NEUTRA : l.color} dot={false} strokeWidth={una ? 1.75 : 2} isAnimationActive={false} connectNulls type={g.escalon ? 'stepAfter' : 'monotone'} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {r && (
        <div className="grid grid-cols-4 border-t mt-1 text-[11px]">
          {([['ÚLTIMO', r.ult], ['MÍN', r.min], ['PROM', r.prom], ['MÁX', r.max]] as const).map(([t, v]) => (
            <div key={t} className="px-1.5 py-1">
              <div className="tracking-widest text-muted-foreground">{t}</div>
              <div className="font-mono tabular-nums">{num(v, dec)}{g.unidad && <span className="text-muted-foreground"> {g.unidad}</span>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Tendencia del panel lateral: se refresca cada minuto mientras está abierto
export default function TendenciaEquipo({ nodo, config }: { nodo: Nodo; config: AppConfig }) {
  const [rango, setRango] = useState(RANGOS[1])
  const [variable, setVariable] = useState(0)
  const [series, setSeries] = useState<Series | null>(null)
  const [error, setError] = useState(false)
  const vacio = serieDe(nodo, {}, config).length === 0

  useEffect(() => {
    if (vacio) return
    let vivo = true
    const traer = () => apiJson<Series>('/reports/series', { method: 'POST', body: JSON.stringify({ from: rango.id, windowSec: rango.windowSec }) })
      .then(s => { if (vivo) { setSeries(s); setError(false) } })
      .catch(() => { if (vivo) setError(true) })
    setSeries(null)
    traer()
    const id = setInterval(traer, 60000)
    return () => { vivo = false; clearInterval(id) }
  }, [rango, vacio])

  if (vacio) return null
  const graficos = series ? serieDe(nodo, series, config) : []
  // medidor y bomba: una variable por vez, elegida con los botones
  const alternas = graficos.filter(g => g.alterna)
  const elegido = alternas[Math.min(variable, alternas.length - 1)]
  const visibles = alternas.length ? [elegido] : graficos
  return (
    <section className="border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b">
        <h3 className="text-xs font-bold tracking-widest uppercase">Tendencia</h3>
        <div role="group" aria-label="Período" className="ml-auto inline-flex border border-border">
          {RANGOS.map(r => <button key={r.id} type="button" aria-pressed={r.id === rango.id} onClick={() => setRango(r)} className={seg(r.id === rango.id)}>{r.label}</button>)}
        </div>
      </div>
      {alternas.length > 1 && (
        <div role="group" aria-label="Variable" className="flex flex-wrap gap-1 px-3 pt-2">
          {alternas.map((g, i) => (
            <button key={g.titulo} type="button" aria-pressed={g === elegido} onClick={() => setVariable(i)}
              className={`border px-2 min-h-[26px] text-[11px] ${g === elegido ? 'border-foreground text-foreground bg-muted font-semibold' : 'border-border text-muted-foreground hover:text-foreground'}`}>{g.titulo}</button>
          ))}
        </div>
      )}
      <div className="p-3 pt-2">
        {error ? <div className="text-sm text-muted-foreground">No se pudo leer el histórico</div>
          : !series ? <SkeletonBloque className="h-48" />
          : visibles.every(g => !g.datos.length) ? <div className="text-sm text-muted-foreground">Sin datos en este período</div>
          : visibles.map(g => (
            <div key={g.titulo} className="mb-2 last:mb-0">
              {!g.alterna && <div className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1">{g.titulo}{g.unidad && ` · ${g.unidad}`}</div>}
              <Grafiquito g={g} />
            </div>
          ))}
      </div>
    </section>
  )
}
