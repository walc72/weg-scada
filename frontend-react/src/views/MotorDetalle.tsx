import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { useDrivesStore, isStale } from '../store/drives'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import { resolveZone, type GaugeKey } from '../lib/gaugeDefaults'
import { useNow } from '@/lib/useNow'
import HalfGauge from '../components/HalfGauge'
import TrendChart from '../components/TrendChart'
import { colorDeSerie, type Magnitud } from '@/lib/paleta'
import FlowBox from '../components/FlowBox'
import { estado, FALLA } from '../components/MotorStrip'
import EventosEquipo from '../components/EventosEquipo'
import LineaEstados from '../components/LineaEstados'
import type { Drive, NominalConfig } from '../types'

const DATA_MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
type Fila = Record<string, number>

// Color de la tendencia por magnitud; las demás variables van con el primer color de serie
const MAGNITUD: Partial<Record<string, Magnitud>> = { current: 'corriente', power: 'potencia', voltage: 'tension' }

// Variables de la tendencia (campos de drive_data en /api/reports/series); se ve una por vez
const TENDENCIAS = (cfw: boolean) => [
  { key: 'current', titulo: 'Corriente de salida (A)', label: 'Corriente', unit: 'A', boton: 'Corriente' },
  { key: 'power', titulo: 'Potencia (kW)', label: 'Potencia', unit: 'kW', boton: 'Potencia' },
  ...(cfw ? [{ key: 'motor_speed', titulo: 'Velocidad (rpm)', label: 'Velocidad', unit: 'rpm', boton: 'Velocidad' },
    { key: 'frequency', titulo: 'Frecuencia (Hz)', label: 'Frecuencia', unit: 'Hz', boton: 'Frecuencia' }] : []),
  { key: 'voltage', titulo: 'Tensión de salida (V)', label: 'Tensión', unit: 'V', boton: 'Tensión' },
  { key: cfw ? 'igbt_temp' : 'scr_temp', titulo: cfw ? 'Temperatura IGBT (°C)' : 'Temperatura SCR (°C)', label: 'Temperatura', unit: '°C', boton: 'Temperatura' },
]
const CAMPOS = ['current', 'power', 'motor_speed', 'frequency', 'voltage', 'igbt_temp', 'scr_temp']

const num = (v: unknown, d = 1, u = '') => (typeof v === 'number' && Number.isFinite(v) ? `${v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })}${u ? ` ${u}` : ''}` : '—')

// el equipo manda las horas como texto ("1234.5"): con punto de miles si es un número
const horas = (t?: string) => (t && Number.isFinite(Number(t)) ? num(Number(t), 1, 'h') : t || '—')

// Datos del equipo que no están en las barras (los que ese modelo no lee quedan afuera)
function datosEquipo(d: Drive, sp: Record<string, number>, nom: NominalConfig = {}): { titulo: string; vivo: boolean; filas: [string, string][] }[] {
  const cfw = d.type !== 'SSW900'
  const igbts = (d.igbtTemps || []).filter(t => typeof t === 'number' && t > 0)
  const grupos: { titulo: string; vivo: boolean; filas: [string, string][] }[] = [
    { titulo: 'Operación', vivo: true, filas: [
      ['Estado del equipo', d.statusText || '—'],
      ['Factor de potencia', num(d.cosPhi, 2)],
      ...(cfw ? [['Velocidad de referencia', num(d.speedRef, 0, 'rpm')] as [string, string]] : []),
      ...(cfw && igbts.length > 1 ? igbts.map((t, i) => [`Temp. IGBT ${i + 1}`, num(t, 1, '°C')] as [string, string]) : []),
      ...(d.motorTemp > 0 ? [['Temp. motor', num(d.motorTemp, 1, '°C')] as [string, string]] : []),
      ['Errores de comunicación', num(d.commErrors, 0)],
    ] },
    { titulo: 'Horas', vivo: true, filas: [
      ['Horas energizado', horas(d.hoursEnergized)],
      ['Horas habilitado', horas(d.hoursEnabled)],
    ] },
    // Datos de placa cargados en Configuración → Bombas (el poller no los lee del equipo: manda valores fijos)
    { titulo: 'Datos nominales', vivo: false, filas: [
      ...(nom.corriente ? [['Corriente nominal', num(nom.corriente, 1, 'A')] as [string, string]] : []),
      ...(nom.tension ? [['Tensión nominal', num(nom.tension, 0, 'V')] as [string, string]] : []),
      ...(cfw && nom.frecuencia ? [['Frecuencia nominal', num(nom.frecuencia, 1, 'Hz')] as [string, string]] : []),
      ...(nom.potencia ? [['Potencia nominal', num(nom.potencia, 1, 'kW')] as [string, string]] : []),
      ...(nom.corriente && d.online ? [['Carga (corriente / nominal)', num(((d.current || 0) / nom.corriente) * 100, 0, '%')] as [string, string]] : []),
    ] },
    { titulo: 'Umbrales de alarma', vivo: false, filas: [
      ...(sp.currentHigh ? [['Corriente alta', `> ${num(sp.currentHigh, 0, 'A')}`] as [string, string]] : []),
      ...(sp.tempHigh ? [['Temperatura alta', `> ${num(sp.tempHigh, 0, '°C')}`] as [string, string]] : []),
      ...(sp.powerHigh ? [['Potencia alta', `> ${num(sp.powerHigh, 0, 'kW')}`] as [string, string]] : []),
    ] },
  ]
  return grupos.filter(g => g.filas.length)
}

// Detalle de un motor (faceplate): estado, variables con sus zonas, tendencia de
// corriente y eventos del equipo. Se llega tocando el motor en el mímico o la tabla.
export default function MotorDetalle() {
  const { name = '' } = useParams()
  const d = useDrivesStore(s => s.drives.get(name))
  const hist = useDrivesStore(s => s.driveHistory.get(name))
  const cfg = useConfigStore(s => s.config)
  const now = useNow()

  // Tendencia: en vivo, últimos 30 min de InfluxDB (los rangos del gráfico piden más); en demo, el buffer en memoria
  const [serie, setSerie] = useState<Fila[] | null>(null)
  const [variable, setVariable] = useState('current')
  const location = useLocation()
  const desde = (location.state as { from?: string } | null)?.from
  const fetchRango = (from: string, to: string, windowSec: number) =>
    authFetch('/api/reports/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, windowSec }) })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j: { drives?: Record<string, number | string>[] }) =>
        (j.drives || []).filter(r => r.name === name).map(r => {
          const o: Fila = { ts: new Date(r._time as string).getTime() }
          for (const k of CAMPOS) if (typeof r[k] === 'number') o[k] = r[k] as number
          return o
        }))
  useEffect(() => {
    if (DATA_MODE !== 'live') return
    const t = Date.now()
    fetchRango(new Date(t - 30 * 60_000).toISOString(), new Date(t).toISOString(), 10).then(setSerie).catch(() => setSerie(null))
  }, [name])
  const buffer = useMemo(() => (hist || []).map(p => ({ ts: p.ts, current: p.current }) as Fila), [hist])

  if (!d) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <div>No se encontró el motor «{name}».</div>
        <Link to={desde || '/'} className="text-sm underline">Volver</Link>
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
  const tendencias = TENDENCIAS(cfw)
  const tend = tendencias.find(t => t.key === variable) ?? tendencias[0]
  // Sin límite configurado no hay banda que mostrar: barra neutra y sin escala
  const sinZona = (k: string) => k === 'bus' || (k === 'potencia' && !sp.powerHigh)

  return (
    <div className="flex flex-col gap-2">
      {/* Encabezado del equipo */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card border px-4 py-3" style={e.tile}>
        <Link to={desde || '/'} className="inline-flex items-center gap-1 border border-border bg-background px-2.5 min-h-[32px] text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent"><ChevronLeft className="h-4 w-4" />{desde?.startsWith('/equipos') ? 'EQUIPOS' : 'RESUMEN'}</Link>
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

      <div className="flex flex-wrap gap-2 items-stretch">
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
        <div className="min-w-0 flex flex-col gap-2" style={{ flex: '999 1 600px' }}>
          {/* en demo solo hay buffer de corriente: las demás variables, en vivo */}
          {DATA_MODE === 'live' && (
            <div role="group" aria-label="Variable de la tendencia" className="flex flex-wrap gap-1">
              {tendencias.map(t => (
                <button key={t.key} type="button" aria-pressed={t.key === tend.key} onClick={() => setVariable(t.key)}
                  className={`border px-2.5 min-h-[28px] text-[11px] ${t.key === tend.key ? 'border-foreground text-foreground bg-card font-semibold' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}>{t.boton}</button>
              ))}
            </div>
          )}
          <TrendChart
            key={tend.key}
            title={tend.titulo}
            data={serie ?? buffer}
            rangeFetch={DATA_MODE === 'live' ? fetchRango : undefined}
            series={[{ key: tend.key, label: tend.label, color: colorDeSerie({ magnitud: MAGNITUD[tend.key], indice: 0 }) }]}
            unit={tend.unit} height={220} fill
          />
        </div>
      </div>

      <section aria-labelledby="t-datos" className="bg-card border">
        <header className="px-3 py-2 border-b"><h2 id="t-datos" className="text-xs font-bold tracking-widest">DATOS DEL EQUIPO</h2></header>
        <div className="p-3 grid gap-x-8 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {datosEquipo(d, sp, cfg?.devices?.find(x => x.name === d.name)?.nominal).map(g => (
            <div key={g.titulo}>
              <h3 className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1">{g.titulo}</h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[13px]">
                {g.filas.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    {/* sin comunicación no se muestran valores viejos; nominales y umbrales sí */}
                    <dd className="font-mono text-right tabular-nums">{!g.vivo || (d.online && !stale) ? v : '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <LineaEstados name={d.name} />
      <EventosEquipo device={d.name} />
    </div>
  )
}
