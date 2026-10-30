import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Loader2 } from 'lucide-react'
import { apiJson } from '../../lib/api'
import { serieDe } from '../../lib/tendencia'
import type { Series } from '../../lib/tendencia'
import type { Nodo } from '../../lib/unifilar'
import type { AppConfig } from '../../types'

const RANGOS = [
  { id: '-1h', label: '1 h', windowSec: 60 },
  { id: '-6h', label: '6 h', windowSec: 300 },
  { id: '-24h', label: '24 h', windowSec: 900 },
]
const hora = (ts: number) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
const num = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 })

// Gráfico chico del panel lateral: se refresca cada minuto mientras está abierto
export default function TendenciaEquipo({ nodo, config }: { nodo: Nodo; config: AppConfig }) {
  const [rango, setRango] = useState(RANGOS[1])
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
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tendencia</div>
        <div className="flex gap-1">
          {RANGOS.map(r => (
            <button key={r.id} type="button" onClick={() => setRango(r)}
              className={`rounded border px-2 py-0.5 text-xs ${r.id === rango.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{r.label}</button>
          ))}
        </div>
      </div>
      {error ? <div className="text-sm text-muted-foreground">No se pudo leer el histórico</div>
        : !series ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando...</div>
        : graficos.every(g => !g.datos.length) ? <div className="text-sm text-muted-foreground">Sin datos en este período</div>
        : graficos.map(g => (
          <div key={g.titulo} className="mb-3">
            <div className="text-xs text-muted-foreground">{g.titulo}{g.unidad && ` (${g.unidad})`}</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={g.datos} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={hora} tick={{ fontSize: 10 }} minTickGap={30} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={!g.escalon}
                  domain={g.escalon ? [(m: number) => Math.floor(m) - 1, (m: number) => Math.ceil(m) + 1] : ['auto', 'auto']} />
                <Tooltip labelFormatter={v => hora(Number(v))} formatter={(v: number, k: string) => [`${num(v)}${g.unidad && ` ${g.unidad}`}`, k]}
                  contentStyle={{ fontSize: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                {g.lineas.map(l => (
                  <Line key={l.key} dataKey={l.key} stroke={l.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls type={g.escalon ? 'stepAfter' : 'monotone'} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
    </section>
  )
}
