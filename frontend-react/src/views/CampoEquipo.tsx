import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useDrivesStore } from '../store/drives'
import type { CampoState } from '../types'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import RegCard from '../components/RegCard'
import RecoCard from '../components/RecoCard'
import GenCard, { GenDetalle } from '../components/GenCard'
import slug from '../lib/slug'
import type { CampoKind } from '../types'
import TrendChart, { type SeriesDef } from '../components/TrendChart'
import EventosEquipo from '../components/EventosEquipo'
import LineaEstados from '../components/LineaEstados'
import { FASOR_COLORES } from '../components/Fasorial'
import { puntosLibres, fmtMed, Luz } from '../components/CampoBase'

const DATA_MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
type Fila = Record<string, number>

// Qué se grafica de cada tipo: regulador → tensión de carga y TAP; reconectador → corriente por fase;
// generador → kW, tensión, frecuencia, temperatura y combustible (x_<slug>: medición libre del mapa)
const GRAFICOS: Record<CampoKind, { titulo: string; unit: string; series: SeriesDef[]; escala?: number; step?: boolean; dec: number }[]> = {
  reg: [
    { titulo: 'Tensión de carga (kV)', unit: 'kV', escala: 1000, dec: 2, series: [{ key: 'v', label: 'Tensión carga', color: 'hsl(var(--foreground))' }] },
    { titulo: 'TAP', unit: '', step: true, dec: 0, series: [{ key: 'tap', label: 'TAP', color: 'hsl(var(--foreground))' }] },
  ],
  reco: [
    { titulo: 'Corriente por fase (A)', unit: 'A', dec: 0, series: (['a', 'b', 'c'] as const).map((f, k) => ({ key: 'i' + f, label: `Fase ${f.toUpperCase()}`, color: FASOR_COLORES[k] })) },
  ],
  gen: [
    { titulo: 'Potencia activa (kW)', unit: 'kW', dec: 0, series: [{ key: 'kw', label: 'kW', color: 'hsl(var(--foreground))' }] },
    { titulo: 'Tensión L-L (V)', unit: 'V', dec: 0, series: ['vl1l2', 'vl2l3', 'vl3l1'].map((key, k) => ({ key, label: ['L1-L2', 'L2-L3', 'L3-L1'][k], color: FASOR_COLORES[k] })) },
    { titulo: 'Frecuencia (Hz)', unit: 'Hz', dec: 1, series: [{ key: 'hz', label: 'Frecuencia', color: 'hsl(var(--foreground))' }] },
    { titulo: 'Temperatura refrigerante (°C)', unit: '°C', dec: 0, series: [{ key: 'x_' + slug('Temperatura refrigerante'), label: 'Refrigerante', color: 'hsl(var(--foreground))' }] },
    { titulo: 'Nivel de combustible (%)', unit: '%', dec: 0, series: [{ key: 'x_' + slug('Nivel de combustible'), label: 'Combustible', color: 'hsl(var(--foreground))' }] },
  ],
}
const VOLVER: Record<CampoKind, string> = { reg: '/equipos?tab=reguladores', reco: '/equipos?tab=reconectadores', gen: '/generadores' }
const TIPO_TXT: Record<CampoKind, string> = { reg: 'Regulador', reco: 'Reconectador', gen: 'Generador' }

// Valor en vivo de una serie: x_<slug> sale de las mediciones libres, el resto de valores
const valorDe = (st: CampoState, k: string) => k.startsWith('x_')
  ? Object.entries(st.extras ?? {}).find(([n]) => 'x_' + slug(n) === k)?.[1]
  : st.valores[k]

// Detalle de un regulador, reconectador o generador: su tarjeta, todas las mediciones y
// señales del mapa, tendencias e historial de eventos (disparos incluidos).
export default function CampoEquipo() {
  const { name = '' } = useParams()
  const st = useDrivesStore(s => s.campo.get(name))
  const cfg = useConfigStore(s => [...(s.config?.reguladores ?? []), ...(s.config?.reconectadores ?? []), ...(s.config?.generadores ?? [])].find(c => c.name === name))
  const tipo = useConfigStore((s): CampoKind => (s.config?.reguladores ?? []).some(c => c.name === name) ? 'reg'
    : (s.config?.generadores ?? []).some(c => c.name === name) ? 'gen' : 'reco')
  const esReg = tipo === 'reg'
  const graficos = GRAFICOS[tipo]
  const claves = graficos.flatMap(g => g.series.map(x => x.key))

  // Tendencias: en vivo, 30 min de InfluxDB (campo_data); en demo, lo que llega mientras la pantalla está abierta
  const [serie, setSerie] = useState<Fila[] | null>(null)
  const fetchRango = (from: string, to: string, windowSec: number) =>
    authFetch('/api/reports/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, windowSec }) })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j: { campo?: Record<string, number | string>[] }) => (j.campo || []).filter(r => r.name === name).map(r => {
        const o: Fila = { ts: new Date(r._time as string).getTime() }
        for (const k of claves) if (typeof r[k] === 'number') o[k] = r[k] as number
        return o
      }))
  useEffect(() => {
    if (DATA_MODE !== 'live') return
    const t = Date.now()
    fetchRango(new Date(t - 30 * 60_000).toISOString(), new Date(t).toISOString(), 10).then(setSerie).catch(() => setSerie(null))
  }, [name])
  const buffer = useRef<Fila[]>([])
  const [, setTick] = useState(0)
  useEffect(() => {
    if (DATA_MODE === 'live' || !st?.online) return
    const o: Fila = { ts: Date.now() }
    for (const k of claves) { const x = valorDe(st, k); if (typeof x === 'number') o[k] = x }
    buffer.current = [...buffer.current.slice(-900), o]
    setTick(t => t + 1)
  }, [st])
  const datos = serie ?? buffer.current

  if (!cfg) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <div>No se encontró el equipo «{name}».</div>
        <Link to={VOLVER[tipo]} className="text-sm underline">Volver</Link>
      </div>
    )
  }

  const { meds, senales } = puntosLibres(cfg)
  const live = !!st?.online
  const volver = VOLVER[tipo]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card border px-4 py-3">
        <Link to={volver} className="inline-flex items-center gap-1 border border-border bg-background px-2.5 min-h-[32px] text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent"><ChevronLeft className="h-4 w-4" />{tipo === 'gen' ? 'GENERADORES' : 'EQUIPOS'}</Link>
        <h1 className="text-[22px] font-bold tracking-wide">{cfg.name}</h1>
        <span className="text-[11px] font-mono text-muted-foreground uppercase">{TIPO_TXT[tipo]} · {cfg.modelo}{cfg.banco ? ` · ${cfg.banco}` : ''}</span>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0" style={{ flex: '1 1 380px' }}>
          {esReg ? <RegCard st={st} cfg={cfg} /> : tipo === 'gen' ? <GenCard st={st} cfg={cfg} /> : <RecoCard st={st} cfg={cfg} />}
          {tipo === 'gen' ? <GenDetalle st={st} cfg={cfg} /> : (meds.length > 0 || senales.length > 0) && (
            <section aria-labelledby="t-libres" className="bg-card border">
              <header className="px-3 py-2 border-b"><h2 id="t-libres" className="text-xs font-bold tracking-widest">MEDICIONES Y SEÑALES</h2></header>
              <div className="p-3 flex flex-col gap-3">
                {meds.length > 0 && (
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px]">
                    {meds.map(p => <div key={p.nombre} className="contents"><dt className="text-muted-foreground">{p.nombre}</dt><dd className="font-mono text-right tabular-nums">{live ? fmtMed(st, p) : '—'}</dd></div>)}
                  </dl>
                )}
                {senales.length > 0 && (
                  <div className="flex flex-col gap-1 border-t pt-2">{senales.map(p => <Luz key={p.nombre} on={live ? st?.senales?.[p.nombre!] : null} label={p.nombre!} />)}</div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-4 min-w-0" style={{ flex: '999 1 600px' }}>
          {graficos.map(g => (
            <TrendChart key={g.titulo} title={g.titulo} unit={g.unit} decimals={g.dec} step={g.step} height={220}
              data={g.escala ? datos.map(r => { const o: Fila = { ts: r.ts }; for (const s of g.series) if (r[s.key] != null) o[s.key] = r[s.key] / g.escala!; return o }) : datos}
              series={g.series}
              rangeFetch={DATA_MODE === 'live' ? (f, t, w) => fetchRango(f, t, w).then(rows => g.escala ? rows.map(r => { const o: Fila = { ts: r.ts }; for (const s of g.series) if (r[s.key] != null) o[s.key] = r[s.key] / g.escala!; return o }) : rows) : undefined}
            />
          ))}
        </div>
      </div>

      <LineaEstados name={cfg.name} motor={tipo === 'gen'} />
      <EventosEquipo device={cfg.name} />
    </div>
  )
}
