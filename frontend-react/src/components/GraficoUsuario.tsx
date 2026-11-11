// Un gráfico de «Mis gráficos» (trazas elegidas por el usuario) con datos de InfluxDB o, sin ellos, del buffer en memoria.
// Lo usan Tendencias → Mis gráficos y el gadget del Dashboard.
import { useMemo } from 'react'
import TrendChart from './TrendChart'
import { useConfigStore } from '../store/config'
import { useDrivesStore, selectDriveList, type HistoryPoint, type MeterPoint } from '../store/drives'
import { varDe, armar, type Src, type Traza, type Grafico, type Datos } from '../lib/misGraficos'

// Sin InfluxDB: buffer en memoria (bombas y medidores), redondeado a 2 s para alinear
function armarBuffer(trazas: Traza[], drives: Map<string, HistoryPoint[]>, meters: Map<string, MeterPoint[]>, since: number, until: number) {
  const porTs = new Map<number, Record<string, number>>()
  trazas.forEach((t, i) => {
    const v = varDe(t)
    const pts: Record<string, number>[] = t.src === 'drive' ? (drives.get(t.name) as unknown as Record<string, number>[]) ?? []
      : t.src === 'meter' ? meters.get(t.name) ?? [] : []
    for (const p of pts) {
      if ((since !== 0 && p.ts < since) || p.ts > until) continue
      const val = p[t.src === 'drive' ? v?.buf ?? t.field : t.field]
      if (typeof val !== 'number') continue
      const ts = Math.round(p.ts / 2000) * 2000
      let o = porTs.get(ts); if (!o) { o = { ts }; porTs.set(ts, o) }
      o[`t${i}`] = val
    }
  })
  return [...porTs.values()].sort((a, b) => a.ts - b.ts)
}

// Equipos elegibles por tipo (nombre interno + etiqueta visible)
export function useEquipos() {
  const cfg = useConfigStore(s => s.config)
  const drives = useDrivesStore(s => s.drives)
  return useMemo(() => {
    const e: Record<Src, { name: string; label: string }[]> = {
      drive: selectDriveList(drives).map(d => ({ name: d.name, label: d.displayName ?? d.name })),
      meter: (cfg?.meters || []).filter(m => m?.name).map(m => ({ name: m.name, label: cfg?.meterNames?.[m.name] || m.name })),
      reco: (cfg?.reconectadores || []).map(c => ({ name: c.name, label: c.name })),
      reg: (cfg?.reguladores || []).filter(c => c.enabled !== false).map(c => ({ name: c.name, label: c.name })),
      gen: (cfg?.generadores || []).filter(c => c.enabled !== false).map(c => ({ name: c.name, label: c.name })),
    }
    return e
  }, [drives, cfg])
}

export const etiquetaTraza = (equipos: ReturnType<typeof useEquipos>, t: Traza) =>
  `${equipos[t.src].find(e => e.name === t.name)?.label ?? t.name} · ${varDe(t)?.label ?? t.field}`

export const tituloGrafico = (equipos: ReturnType<typeof useEquipos>, g: Grafico) =>
  g.titulo || (g.trazas.length ? g.trazas.map(t => etiquetaTraza(equipos, t)).join(' / ') : 'Gráfico sin variables')

const SIN_D: Map<string, HistoryPoint[]> = new Map()
const SIN_M: Map<string, MeterPoint[]> = new Map()

export default function GraficoUsuario({ grafico: g, data, since, until, fetchRange }: {
  grafico: Grafico
  data: Datos | null   // null = sin InfluxDB → buffer en memoria
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<Datos>
}) {
  const equipos = useEquipos()
  // con datos de InfluxDB el buffer no se usa: no suscribirse (cada lote en vivo redibujaba el gráfico de 24 h)
  const driveHistory = useDrivesStore(s => data ? SIN_D : s.driveHistory)
  const meterHistory = useDrivesStore(s => data ? SIN_M : s.meterHistory)
  const unidades = [...new Set(g.trazas.map(t => varDe(t)?.unit ?? ''))]
  const unit = unidades.length === 1 ? unidades[0] : ''
  const series = g.trazas.map((t, i) => ({ key: `t${i}`, label: etiquetaTraza(equipos, t), color: t.color }))
  const filas = useMemo(() => data ? armar(data, g.trazas).filter(p => (since === 0 || p.ts >= since) && p.ts <= until)
    : armarBuffer(g.trazas, driveHistory, meterHistory, since, until), [data, g.trazas, since, until, driveHistory, meterHistory])
  return (
    <TrendChart key={g.trazas.map(t => t.src + t.name + t.field).join()} title={tituloGrafico(equipos, g) + (unit ? ` (${unit})` : '')} data={filas} series={series}
      unit={unit} height={220} yDomain={['auto', 'auto']} decimals={unit === '' || unit === 'kV' ? 2 : 0}
      rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => armar(d, g.trazas)))} />
  )
}
