import { SkeletonBloque } from '../ui/skeleton'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { apiJson } from '../../lib/api'
import { serieDe } from '../../lib/tendencia'
import type { Grafico, Series } from '../../lib/tendencia'
import type { Nodo } from '../../lib/unifilar'
import type { AppConfig } from '../../types'
import { ETIQUETA } from '../panel/ValoresClave'

// Período fijo: últimas 6 h en ventanas de 5 min
const RANGO = { id: '-6h', windowSec: 300 }
const hora = (ts: number) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
const num = (v: number, d = 1) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
const MONO = { fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', fill: 'hsl(var(--muted-foreground))' }

function Grafiquito({ g }: { g: Grafico }) {
  const dec = g.dec ?? 1
  const una = g.lineas.length === 1
  return (
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
          <Line key={l.key} dataKey={l.key} stroke={l.color} dot={false} strokeWidth={una ? 1.75 : 2} isAnimationActive={false} connectNulls type={g.escalon ? 'stepAfter' : 'monotone'} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// Tendencia del panel lateral: se refresca cada minuto mientras está abierto
export default function TendenciaEquipo({ nodo, config }: { nodo: Nodo; config: AppConfig }) {
  const [variable, setVariable] = useState(0)
  const [series, setSeries] = useState<Series | null>(null)
  const [error, setError] = useState(false)
  const vacio = serieDe(nodo, {}, config).length === 0

  useEffect(() => {
    if (vacio) return
    let vivo = true
    const traer = () => apiJson<Series>('/reports/series', { method: 'POST', body: JSON.stringify({ from: RANGO.id, windowSec: RANGO.windowSec }) })
      .then(s => { if (vivo) { setSeries(s); setError(false) } })
      .catch(() => { if (vivo) setError(true) })
    setSeries(null)
    traer()
    const id = setInterval(traer, 60000)
    return () => { vivo = false; clearInterval(id) }
  }, [vacio])

  if (vacio) return null
  const graficos = series ? serieDe(nodo, series, config) : []
  // medidor y bomba: una variable por vez, elegida con los botones
  const alternas = graficos.filter(g => g.alterna)
  const elegido = alternas[Math.min(variable, alternas.length - 1)]
  const visibles = alternas.length ? [elegido] : graficos
  return (
    <section className="border bg-card">
      <h3 className={`${ETIQUETA} px-3 py-2 border-b`}>Tendencia · 6 h</h3>
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
