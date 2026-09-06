import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import type { WaveformData, Harmonic } from '../types'
import { RefreshCw, Waves, BarChart3, AlertTriangle } from 'lucide-react'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

const SAMPLES_PER_CYCLE = 200
const CYCLES = 2
const SPECTRUM_BARS = 25

// Colores por fase (V e I comparten color de fase; I4 = neutro)
const PHASE_COLORS: Record<string, string> = {
  V1: '#ef4444', V2: '#22c55e', V3: '#3b82f6',
  I1: '#ef4444', I2: '#22c55e', I3: '#3b82f6', I4: '#a855f7'
}

// ─── Reconstruccion de la señal a partir de armonicos ───
function reconstruct(harmonics: Harmonic[], freq: number) {
  const n = SAMPLES_PER_CYCLE * CYCLES
  const periodMs = 1000 / freq
  const data: { t: number; y: number }[] = new Array(n)
  for (let s = 0; s < n; s++) {
    const angle = (s / SAMPLES_PER_CYCLE) * 2 * Math.PI
    let y = 0
    for (let h = 0; h < harmonics.length; h++) {
      const [amp, phaseDeg] = harmonics[h]
      if (amp === 0) continue
      y += amp * Math.sin(angle * (h + 1) + (phaseDeg * Math.PI) / 180)
    }
    data[s] = { t: (s / SAMPLES_PER_CYCLE) * periodMs, y }
  }
  return data
}

function channelStats(harmonics: Harmonic[]) {
  const fund = harmonics[0]?.[0] ?? 0
  let sumSq = 0
  let sumSqHarm = 0
  for (let h = 0; h < harmonics.length; h++) {
    const a = harmonics[h][0]
    sumSq += a * a
    if (h > 0) sumSqHarm += a * a
  }
  return {
    rms: Math.sqrt(sumSq / 2),
    thd: fund > 0 ? (Math.sqrt(sumSqHarm) / fund) * 100 : 0,
    fund
  }
}

// ─── Datos mock para desarrollo sin medidor ───
function mockWaveform(name: string): WaveformData {
  const mk = (base: number, dist: number): { harmonics: Harmonic[] } => {
    const harmonics: Harmonic[] = []
    for (let h = 1; h <= 63; h++) {
      let amp = 0
      if (h === 1) amp = base * (0.97 + Math.random() * 0.06)
      else if (h % 2 === 1 && h <= 13) amp = (base * dist) / h + Math.random() * base * 0.002
      harmonics.push([amp, h === 1 ? Math.random() * 360 : Math.random() * 360])
    }
    return { harmonics }
  }
  return {
    name, freq: 49.9 + Math.random() * 0.2, numHarmonics: 63, ts: Date.now(),
    channels: {
      V1: mk(19100, 0.02), V2: mk(19150, 0.025), V3: mk(19080, 0.02),
      I1: mk(85, 0.09), I2: mk(83, 0.08), I3: mk(86, 0.1), I4: mk(2.5, 0.3)
    }
  }
}

// ─── Grafico de un canal ───
interface WaveChartProps {
  channel: string
  harmonics: Harmonic[]
  freq: number
  unit: string
  spectrum: boolean
}

function WaveChart({ channel, harmonics, freq, unit, spectrum }: WaveChartProps) {
  const color = PHASE_COLORS[channel] || '#3b82f6'
  const stats = useMemo(() => channelStats(harmonics), [harmonics])

  const waveData = useMemo(
    () => (spectrum ? [] : reconstruct(harmonics, freq)),
    [harmonics, freq, spectrum]
  )
  const spectrumData = useMemo(() => {
    if (!spectrum) return []
    return harmonics.slice(0, SPECTRUM_BARS).map(([amp], i) => ({
      h: i + 1,
      pct: stats.fund > 0 ? (amp / stats.fund) * 100 : 0
    }))
  }, [harmonics, spectrum, stats.fund])

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold" style={{ color }}>{channel}</span>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span>RMS <strong className="text-foreground">{stats.rms.toFixed(1)} {unit}</strong></span>
          <span>THD <strong className={stats.thd > 8 ? 'text-destructive' : 'text-foreground'}>{stats.thd.toFixed(1)}%</strong></span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        {spectrum ? (
          <BarChart data={spectrumData} margin={{ top: 2, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis dataKey="h" tick={{ fontSize: 9 }} stroke="currentColor" strokeOpacity={0.3} />
            <YAxis tick={{ fontSize: 9 }} unit="%" stroke="currentColor" strokeOpacity={0.3}
              tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(2)} %`, '% de fundamental']}
              labelFormatter={(h) => `Armónico ${h}`}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Bar dataKey="pct" fill={color} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart data={waveData} margin={{ top: 2, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis
              dataKey="t" type="number" domain={[0, 'dataMax']}
              tickFormatter={(v: number) => v.toFixed(0)}
              tick={{ fontSize: 9 }} stroke="currentColor" strokeOpacity={0.3}
              unit=" ms"
            />
            <YAxis tick={{ fontSize: 9 }} stroke="currentColor" strokeOpacity={0.3}
              tickFormatter={(v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(1)} ${unit}`, channel]}
              labelFormatter={(t) => `${Number(t).toFixed(2)} ms`}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Line type="monotone" dataKey="y" stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </Card>
  )
}

// ─── Vista principal ───
export default function FormaOnda() {
  const config = useConfigStore(s => s.config)
  const meters = useMemo(
    () => (config?.meters || []).filter(m => m.enabled !== false),
    [config]
  )

  const [selected, setSelected] = useState('')
  const [data, setData] = useState<WaveformData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [auto, setAuto] = useState(false)
  const [spectrum, setSpectrum] = useState(false)
  const loadingRef = useRef(false)

  // Seleccionar el primer medidor disponible
  useEffect(() => {
    if (!selected && meters.length) setSelected(meters[0].name)
  }, [meters, selected])

  const fetchWaveform = useCallback(async (meterName: string) => {
    if (!meterName || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError('')
    try {
      if (MODE === 'mock') {
        await new Promise(r => setTimeout(r, 400))
        setData(mockWaveform(meterName))
      } else {
        const r = await authFetch(`${API_BASE}/waveform/${encodeURIComponent(meterName)}`)
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
        setData(body)
      }
    } catch (e: any) {
      setError(e.message || 'Error desconocido')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  // Primera lectura al elegir medidor
  useEffect(() => {
    if (selected) fetchWaveform(selected)
  }, [selected, fetchWaveform])

  // Auto-refresco
  useEffect(() => {
    if (!auto || !selected) return
    const id = setInterval(() => fetchWaveform(selected), 5000)
    return () => clearInterval(id)
  }, [auto, selected, fetchWaveform])

  const voltChannels = useMemo(
    () => Object.keys(data?.channels || {}).filter(c => c.startsWith('V')),
    [data]
  )
  const currChannels = useMemo(
    () => Object.keys(data?.channels || {}).filter(c => c.startsWith('I')),
    [data]
  )

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <Waves className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Formas de Onda</h2>

        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={selected}
          onChange={(e) => { setData(null); setSelected(e.target.value) }}
        >
          {meters.length === 0 && <option value="">Sin medidores configurados</option>}
          {meters.map(m => (
            <option key={m.name} value={m.name}>
              {config?.meterNames?.[m.name] || m.name} ({m.type})
            </option>
          ))}
        </select>

        <Button variant="outline" size="sm" onClick={() => fetchWaveform(selected)} disabled={loading || !selected}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Leyendo...' : 'Actualizar'}
        </Button>

        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto (5s)
        </label>

        <Button
          variant={spectrum ? 'default' : 'outline'} size="sm"
          onClick={() => setSpectrum(v => !v)}
          title="Alternar entre forma de onda y espectro de armónicos"
        >
          <BarChart3 className="h-4 w-4 mr-1" />
          {spectrum ? 'Espectro' : 'Onda'}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {data && (
            <>
              <Badge variant="secondary">{data.freq.toFixed(2)} Hz</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(data.ts).toLocaleTimeString()}
              </span>
            </>
          )}
        </div>
      </div>

      {error && (
        <Card className="p-4 flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </Card>
      )}

      {!data && !error && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {loading ? 'Leyendo armónicos del medidor...' : 'Seleccioná un medidor para leer la forma de onda'}
        </div>
      )}

      {data && (
        <>
          {/* Tensiones */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {voltChannels.map(c => (
              <WaveChart key={c} channel={c} harmonics={data.channels[c].harmonics}
                freq={data.freq} unit="V" spectrum={spectrum} />
            ))}
          </div>
          {/* Corrientes */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {currChannels.map(c => (
              <WaveChart key={c} channel={c} harmonics={data.channels[c].harmonics}
                freq={data.freq} unit="A" spectrum={spectrum} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
