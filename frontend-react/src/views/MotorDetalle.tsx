import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useDrivesStore, isStale } from '../store/drives'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import { resolveZone, type GaugeKey } from '../lib/gaugeDefaults'
import { useNow } from '@/lib/useNow'
import HalfGauge from '../components/HalfGauge'
import TrendChart from '../components/TrendChart'
import FlowBox from '../components/FlowBox'
import { estado, FALLA } from '../components/MotorStrip'
import EventosEquipo from '../components/EventosEquipo'

const DATA_MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

// Detalle de un motor (faceplate): estado, variables con sus zonas, tendencia de
// corriente y eventos del equipo. Se llega tocando el motor en el mímico o la tabla.
export default function MotorDetalle() {
  const { name = '' } = useParams()
  const d = useDrivesStore(s => s.drives.get(name))
  const hist = useDrivesStore(s => s.driveHistory.get(name))
  const cfg = useConfigStore(s => s.config)
  const now = useNow()

  // Tendencia: en vivo, últimos 30 min de InfluxDB (los rangos del gráfico piden más); en demo, el buffer en memoria
  const [serie, setSerie] = useState<Record<string, number>[] | null>(null)
  const fetchRango = (from: string, to: string, windowSec: number) =>
    authFetch('/api/reports/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, windowSec }) })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j: { drives?: { _time: string; name: string; current?: number }[] }) =>
        (j.drives || []).filter(r => r.name === name && typeof r.current === 'number')
          .map(r => ({ ts: new Date(r._time).getTime(), current: r.current as number })))
  useEffect(() => {
    if (DATA_MODE !== 'live') return
    const t = Date.now()
    fetchRango(new Date(t - 30 * 60_000).toISOString(), new Date(t).toISOString(), 10).then(setSerie).catch(() => setSerie(null))
  }, [name])
  const buffer = useMemo(() => (hist || []).map(p => ({ ts: p.ts, current: p.current })), [hist])

  if (!d) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <div>No se encontró el motor «{name}».</div>
        <Link to="/" className="text-sm underline">Volver al resumen</Link>
      </div>
    )
  }

  const stale = d.online && isStale(d._ts, now, d.pollMs)
  const e = estado(d, stale)
  const cfw = d.type !== 'SSW900'
  const zona = (k: GaugeKey) => resolveZone(d.type, k, cfg?.gaugeZones?.[d.name]?.[k])
  const sp = { ...(cfg?.alarmSetpoints?.defaults?.[d.type] ?? {}), ...(cfg?.alarmSetpoints?.overrides?.[d.name] ?? {}) } as Record<string, number>
  const tempHigh = sp.tempHigh ?? 90
  const temp = cfw ? d.igbtTemp : d.scrTemp
  const powerMax = Math.max(sp.powerHigh ?? 0, (d.power || 0) * 1.25, 1)

  const vars = [
    ...(cfw ? [{ k: 'velocidad', value: d.motorSpeed || 0, label: 'Velocidad', unit: 'rpm', ...zona('velocidad') }] : []),
    { k: 'corriente', value: d.current || 0, label: 'Corriente', unit: 'A', ...zona('corriente') },
    { k: 'tension', value: d.outputVoltage || 0, label: 'Tensión salida', unit: 'V', ...zona('tension') },
    ...(cfw ? [{ k: 'frecuencia', value: d.frequency || 0, label: 'Frecuencia', unit: 'Hz', ...zona('frecuencia') }] : []),
    { k: 'potencia', value: d.power || 0, label: 'Potencia', unit: 'kW', min: 0, max: powerMax, green: sp.powerHigh ? sp.powerHigh * 0.85 : powerMax, yellow: sp.powerHigh ?? powerMax, decimals: 1 },
    ...(cfw ? [{ k: 'torque', value: Math.abs(d.torque || 0), label: 'Torque', unit: '%', min: 0, max: 150, green: 100, yellow: 120, decimals: 1 }] : []),
    { k: 'temp', value: temp || 0, label: cfw ? 'Temp. IGBT' : 'Temp. SCR', unit: '°C', min: 0, max: Math.round(tempHigh * 1.3), green: tempHigh * 0.85, yellow: tempHigh, decimals: 1 },
    ...(cfw ? [{ k: 'bus', value: d.dcLink || 0, label: 'Bus DC', unit: 'V', min: 0, max: 800, green: 800, yellow: 800, decimals: 0 }] : []),
  ]
  const enMarcha = d.online && !stale && d.running
  // Sin límite configurado no hay banda que mostrar: barra neutra y sin escala
  const sinZona = (k: string) => k === 'bus' || (k === 'potencia' && !sp.powerHigh)

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado del equipo */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card border px-4 py-3" style={e.tile}>
        <Link to="/" className="inline-flex items-center gap-1 border border-border bg-background px-2.5 min-h-[32px] text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent"><ChevronLeft className="h-4 w-4" />RESUMEN</Link>
        <svg width="40" height="40" viewBox="0 0 40 40" role="img" aria-label={`Motor ${d.displayName || d.name}: ${e.txt}`}>
          <circle cx="20" cy="20" r="17" style={{ fill: e.symFill, stroke: e.sym, strokeWidth: 2, strokeDasharray: e.dash }} />
          <text x="20" y="22" textAnchor="middle" style={{ fill: e.letra, font: "700 14px 'IBM Plex Sans', sans-serif" }}>M</text>
          <text x="20" y="32" textAnchor="middle" style={{ fill: e.letra, font: "600 8px 'IBM Plex Mono', monospace" }}>3~</text>
        </svg>
        <h1 className="text-[22px] font-bold tracking-wide">{d.displayName || d.name}</h1>
        <span className={`text-[13px] font-bold tracking-widest px-3 py-1 border ${e === FALLA ? 'blink' : ''}`} style={{ background: e.bg, color: e.fg, borderColor: e.bd }}>
          {e.txt}
        </span>
        {e === FALLA && <span className="text-[13px]">{d.faultText}</span>}
      </div>

      <div className="flex flex-wrap gap-4 items-stretch">
        {/* Variables */}
        <section aria-labelledby="t-var" className="bg-card border min-w-0" style={{ flex: '1 1 380px' }}>
          <header className="flex items-center gap-2 px-3 py-2 border-b flex-wrap">
            <h2 id="t-var" className="text-xs font-bold tracking-widest">VARIABLES</h2>
            <span className="ml-auto text-[11px] text-muted-foreground">{d.online ? (stale ? 'último valor recibido' : 'en vivo') : 'sin comunicación'}</span>
          </header>
          <div className="p-3 flex flex-col gap-3.5">
            {vars.map(({ k, ...g }) => (
              <HalfGauge key={k} {...g} stale={!d.online || stale}
                plain={sinZona(k) || (!enMarcha && k !== 'temp')} escala={!sinZona(k)} />
            ))}
            <FlowBox d={d} stale={stale} now={now} />
          </div>
        </section>

        {/* Tendencia */}
        <div className="min-w-0" style={{ flex: '999 1 600px' }}>
          <TrendChart
            title="Corriente de salida (A)"
            data={serie ?? buffer}
            rangeFetch={DATA_MODE === 'live' ? fetchRango : undefined}
            series={[{ key: 'current', label: 'Corriente', color: 'hsl(var(--foreground))' }]}
            unit="A" height={220} fill
          />
        </div>
      </div>

      <EventosEquipo device={d.name} />
    </div>
  )
}
