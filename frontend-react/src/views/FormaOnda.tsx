import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import type { WaveformData, Harmonic } from '../types'
import { RefreshCw, Waves, BarChart3, AlertTriangle, Compass } from 'lucide-react'

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

// Etiquetas legibles por canal
const CH_LABEL: Record<string, string> = {
  V1: 'Va', V2: 'Vb', V3: 'Vc',
  I1: 'Ia', I2: 'Ib', I3: 'Ic', I4: 'I4'
}
const label = (c: string) => CH_LABEL[c] || c

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
  const mk = (base: number, dist: number, phase: number): { harmonics: Harmonic[] } => {
    const harmonics: Harmonic[] = []
    for (let h = 1; h <= 63; h++) {
      let amp = 0
      if (h === 1) amp = base * (0.97 + Math.random() * 0.06)
      else if (h % 2 === 1 && h <= 13) amp = (base * dist) / h + Math.random() * base * 0.002
      harmonics.push([amp, h === 1 ? phase : Math.random() * 360])
    }
    return { harmonics }
  }
  // fases realistas: V trifásico ~120° + corrientes con desfase de carga inductiva
  return {
    name, freq: 49.9 + Math.random() * 0.2, numHarmonics: 63, ts: Date.now(),
    channels: {
      V1: mk(19100, 0.02, 0), V2: mk(19150, 0.025, -120), V3: mk(19080, 0.02, 120),
      I1: mk(85, 0.09, -28), I2: mk(83, 0.08, -148), I3: mk(86, 0.1, 92), I4: mk(2.5, 0.3, 40)
    }
  }
}

// ─── Grafico combinado (todas las fases de un grupo) ───
interface CombinedChartProps {
  channels: string[]
  data: WaveformData
  unit: string
  spectrum: boolean
}

function CombinedChart({ channels, data, unit, spectrum }: CombinedChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setHidden(prev => {
    const n = new Set(prev)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })
  const legendFormatter = (v: any) => {
    const k = String(v)
    return <span style={{ opacity: hidden.has(k) ? 0.35 : 1, textDecoration: hidden.has(k) ? 'line-through' : 'none' }}>{label(k)}</span>
  }
  const onLegendClick = (o: any) => toggle(String(o?.dataKey ?? o?.value ?? ''))

  const stats = useMemo(
    () => channels.map(c => ({ c, ...channelStats(data.channels[c].harmonics) })),
    [channels, data]
  )

  const waveData = useMemo(() => {
    if (spectrum) return []
    const recs: Record<string, { t: number; y: number }[]> = {}
    channels.forEach(c => { recs[c] = reconstruct(data.channels[c].harmonics, data.freq) })
    const n = SAMPLES_PER_CYCLE * CYCLES
    const out: Record<string, number>[] = new Array(n)
    for (let s = 0; s < n; s++) {
      const row: Record<string, number> = { t: recs[channels[0]][s].t }
      channels.forEach(c => { row[c] = recs[c][s].y })
      out[s] = row
    }
    return out
  }, [channels, data, spectrum])

  const spectrumData = useMemo(() => {
    if (!spectrum) return []
    const funds: Record<string, number> = {}
    channels.forEach(c => { funds[c] = data.channels[c].harmonics[0]?.[0] || 0 })
    const out: Record<string, number>[] = []
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      const row: Record<string, number> = { h: i + 1 }
      channels.forEach(c => {
        const amp = data.channels[c].harmonics[i]?.[0] || 0
        row[c] = funds[c] > 0 ? (amp / funds[c]) * 100 : 0
      })
      out.push(row)
    }
    return out
  }, [channels, data, spectrum])

  return (
    <Card className="p-3">
      {/* stats por canal */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[10px]">
        {stats.map(s => (
          <div key={s.c} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PHASE_COLORS[s.c] }} />
            <span className="font-bold" style={{ color: PHASE_COLORS[s.c] }}>{label(s.c)}</span>
            <span className="text-muted-foreground">
              RMS <strong className="text-foreground">
                {s.rms >= 1000 ? `${(s.rms / 1000).toFixed(2)}k` : s.rms.toFixed(1)} {unit}
              </strong>
            </span>
            <span className="text-muted-foreground">
              THD <strong className={s.thd > 8 ? 'text-destructive' : 'text-foreground'}>{s.thd.toFixed(1)}%</strong>
            </span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={230}>
        {spectrum ? (
          <BarChart data={spectrumData} margin={{ top: 2, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis dataKey="h" tick={{ fontSize: 9 }} stroke="currentColor" strokeOpacity={0.3} />
            <YAxis tick={{ fontSize: 9 }} unit="%" stroke="currentColor" strokeOpacity={0.3}
              tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip
              formatter={(v: number, n) => [`${v.toFixed(2)} %`, label(String(n))]}
              labelFormatter={(h) => `Armónico ${h}`}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Legend formatter={legendFormatter} onClick={onLegendClick} iconType="rect"
              wrapperStyle={{ fontSize: 10, cursor: 'pointer' }} />
            {channels.map(c => (
              <Bar key={c} dataKey={c} fill={PHASE_COLORS[c]} hide={hidden.has(c)} isAnimationActive={false} />
            ))}
          </BarChart>
        ) : (
          <LineChart data={waveData} margin={{ top: 2, right: 8, left: -14, bottom: 0 }}>
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
              formatter={(v: number, n) => [`${v.toFixed(1)} ${unit}`, label(String(n))]}
              labelFormatter={(t) => `${Number(t).toFixed(2)} ms`}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Legend formatter={legendFormatter} onClick={onLegendClick} iconType="plainline"
              wrapperStyle={{ fontSize: 10, cursor: 'pointer' }} />
            {channels.map(c => (
              <Line key={c} type="monotone" dataKey={c} stroke={PHASE_COLORS[c]} hide={hidden.has(c)}
                dot={false} strokeWidth={1.5} isAnimationActive={false} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </Card>
  )
}

// ─── Diagrama fasorial ───
interface PhasorInfo {
  c: string
  kind: 'V' | 'I'
  magRms: number
  angleRel: number  // grados relativos a V1 (Va)
}

function computePhasors(data: WaveformData, channels: string[]): PhasorInfo[] {
  const refCh = channels.find(c => c.startsWith('V')) || channels[0]
  const refPhase = data.channels[refCh]?.harmonics[0]?.[1] ?? 0
  const norm = (a: number) => { let x = ((a % 360) + 360) % 360; if (x > 180) x -= 360; return x }
  return channels.map(c => {
    const [amp, phase] = data.channels[c].harmonics[0] || [0, 0]
    return {
      c,
      kind: c.startsWith('V') ? 'V' : 'I',
      magRms: amp / Math.SQRT2,
      angleRel: norm(phase - refPhase)
    }
  })
}

function PhasorDiagram({ phasors }: { phasors: PhasorInfo[] }) {
  const cx = 150, cy = 150, R = 120, LEN = 108
  const vMax = Math.max(...phasors.filter(p => p.kind === 'V').map(p => p.magRms), 1e-9)
  const iMax = Math.max(...phasors.filter(p => p.kind === 'I').map(p => p.magRms), 1e-9)

  const arrows = phasors.map(p => {
    const groupMax = p.kind === 'V' ? vMax : iMax
    const len = LEN * Math.min(1, p.magRms / groupMax)
    const rad = (p.angleRel * Math.PI) / 180
    const dx = Math.cos(rad), dy = Math.sin(rad)
    const x2 = cx + len * dx, y2 = cy - len * dy
    // cabeza de flecha
    const sdx = dx, sdy = -dy
    const bx = x2 - 11 * sdx, by = y2 - 11 * sdy
    const px = -sdy, py = sdx
    const head = `${x2},${y2} ${bx + 5 * px},${by + 5 * py} ${bx - 5 * px},${by - 5 * py}`
    const lx = cx + (len + 16) * dx, ly = cy - (len + 16) * dy
    return { ...p, x2, y2, head, lx, ly, len }
  })

  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[340px] mx-auto">
      {/* circulo y ejes */}
      <circle cx={cx} cy={cy} r={R} fill="currentColor" fillOpacity={0.04}
        stroke="currentColor" strokeOpacity={0.25} />
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="currentColor" strokeOpacity={0.2} />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="currentColor" strokeOpacity={0.2} />
      <text x={cx + R + 6} y={cy + 3} fontSize={10} fill="currentColor" fillOpacity={0.5}>0</text>
      <text x={cx - 6} y={cy - R - 4} fontSize={10} fill="currentColor" fillOpacity={0.5}>90</text>
      <text x={cx - R - 22} y={cy + 3} fontSize={10} fill="currentColor" fillOpacity={0.5}>180</text>
      <text x={cx - 12} y={cy + R + 12} fontSize={10} fill="currentColor" fillOpacity={0.5}>270</text>

      {arrows.map(a => (
        <g key={a.c}>
          <line x1={cx} y1={cy} x2={a.x2} y2={a.y2}
            stroke={PHASE_COLORS[a.c]} strokeWidth={a.kind === 'I' ? 1.6 : 2.2}
            strokeDasharray={a.kind === 'I' ? '5 3' : undefined} />
          {a.len > 6 && <polygon points={a.head} fill={PHASE_COLORS[a.c]} />}
          <text x={a.lx} y={a.ly + 3} fontSize={11} fontWeight={700}
            textAnchor="middle" fill={PHASE_COLORS[a.c]}>{label(a.c)}</text>
        </g>
      ))}
    </svg>
  )
}

function PhasorPanel({ data, channels }: { data: WaveformData; channels: string[] }) {
  const phasors = useMemo(() => computePhasors(data, channels), [data, channels])
  // orden de la tabla: Va, Ia, Vb, Ib, Vc, Ic, (blank), I4
  const order = ['V1', 'I1', 'V2', 'I2', 'V3', 'I3', 'V4', 'I4']
  const rows = order.filter(c => phasors.some(p => p.c === c)).map(c => phasors.find(p => p.c === c)!)
  const fmtMag = (p: PhasorInfo) =>
    p.kind === 'V' && p.magRms >= 1000 ? (p.magRms / 1000).toFixed(3) : p.magRms.toFixed(3)

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Compass className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold">Diagrama fasorial</span>
        <span className="text-[10px] text-muted-foreground">(ángulos relativos a Va, sentido antihorario)</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
        <PhasorDiagram phasors={phasors} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left font-medium py-1.5 px-2">Fasor</th>
                <th className="text-right font-medium py-1.5 px-2">Magnitud</th>
                <th className="text-right font-medium py-1.5 px-2">Ángulo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.c} className={i % 2 ? 'bg-muted/40' : ''}>
                  <td className="py-1.5 px-2 font-bold" style={{ color: PHASE_COLORS[p.c] }}>{label(p.c)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {fmtMag(p)} <span className="text-[10px] text-muted-foreground">{p.kind === 'V' && p.magRms >= 1000 ? 'kV' : p.kind === 'V' ? 'V' : 'A'}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{p.angleRel.toFixed(1)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
  const allChannels = useMemo(() => [...voltChannels, ...currChannels], [voltChannels, currChannels])

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
          {/* Tensiones y corrientes en gráficos unificados */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {voltChannels.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1 px-1">
                  Tensiones {spectrum ? '— espectro de armónicos' : '(V)'}
                </div>
                <CombinedChart channels={voltChannels} data={data} unit="V" spectrum={spectrum} />
              </div>
            )}
            {currChannels.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1 px-1">
                  Corrientes {spectrum ? '— espectro de armónicos' : '(A)'}
                </div>
                <CombinedChart channels={currChannels} data={data} unit="A" spectrum={spectrum} />
              </div>
            )}
          </div>

          {/* Diagrama fasorial */}
          {allChannels.length > 0 && <PhasorPanel data={data} channels={allChannels} />}
        </>
      )}
    </div>
  )
}
