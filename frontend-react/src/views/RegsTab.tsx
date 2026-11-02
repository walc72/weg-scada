// Tendencias → Reguladores (módulo unifilar): tap (escalonado) y tensión vs consigna. Cada gráfico
// tiene su propia selección de reguladores (botones independientes, combinables entre bancos).
import { useMemo, useState } from 'react'
import TrendChart, { SERIE_NEUTRA, type SeriesDef } from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { puntosLibres } from '../components/CampoBase'
import LibresTrend from '../components/LibresTrend'
import SelectorCampo from '../components/SelectorCampo'
import { FASOR_COLORES, porBanco } from '../components/Fasorial'
import type { CampoConfig } from '../types'
import type { CampoResp, CampoRow } from './RecosTab'

type Fila = Record<string, number>
type Rango = (from: string, to: string, ws: number) => Promise<CampoResp>
const enRango = (t: number, since: number, until: number) => (since === 0 || t >= since) && t <= until

// Une por tiempo los campos de varios reguladores: clave `${campo}_${i}` (i = posición en la selección)
function unir(rows: CampoRow[], nombres: string[], campos: string[]): Fila[] {
  const m = new Map<number, Fila>()
  for (const r of rows) {
    const i = nombres.indexOf(r.name)
    if (i < 0) continue
    const ts = new Date(r._time).getTime()
    const o = m.get(ts) ?? { ts }
    for (const c of campos) { const v = r[c]; if (typeof v === 'number' && !isNaN(v)) o[`${c}_${i}`] = v }
    m.set(ts, o)
  }
  return [...m.values()].sort((a, b) => a.ts - b.ts)
}
const filas = (d: CampoResp | null) => (d?.campo || []).filter(r => r.kind === 'reg')

// Un gráfico (tap o tensión) con sus propios botones de reguladores
function GraficoRegs({ tipo, regs, data, since, until, fetchRange }: {
  tipo: 'tap' | 'v'; regs: CampoConfig[]; data: CampoResp; since: number; until: number; fetchRange?: Rango
}) {
  const bancos = porBanco(regs)
  const [sel, setSel] = useState<string[]>([])
  const validos = sel.filter(n => regs.some(r => r.name === n))
  // de entrada, las fases del primer banco
  const grupo = validos.length ? regs.filter(r => validos.includes(r.name)) : (bancos.find(g => g.banco && g.regs.length > 1)?.regs ?? regs.slice(0, 1))
  const nombres = grupo.map(r => r.name)
  const banco = bancos.find(g => g.banco && g.regs.length === grupo.length && g.regs.every(r => nombres.includes(r.name)))
  const titulo = banco ? banco.banco! : nombres.join(', ')
  const campos = tipo === 'tap' ? ['tap'] : ['v', 'vConsigna']
  const datos = useMemo(() => unir(filas(data), nombres, campos).filter(p => enRango(p.ts, since, until)), [data, nombres.join('|'), since, until])
  const rf = fetchRange && ((from: string, to: string, ws: number) => fetchRange(from, to, ws).then(d => unir(filas(d), nombres, campos)))

  // un color fijo por regulador (su posición dentro del banco, como en Equipos); uno solo, neutro
  const color = (n: string) => {
    if (nombres.length === 1) return SERIE_NEUTRA
    const g = bancos.find(b => b.regs.some(r => r.name === n))!
    return FASOR_COLORES[g.regs.findIndex(r => r.name === n) % FASOR_COLORES.length]
  }
  const varios = nombres.length > 1
  let series: SeriesDef[]
  if (tipo === 'tap') series = nombres.map((n, i) => ({ key: `tap_${i}`, label: varios ? n : 'Tap', color: color(n) }))
  else {
    // consigna: una por banco (la del primer regulador elegido de cada banco)
    const consignas = bancos.map(b => nombres.findIndex(n => b.regs.some(r => r.name === n))).filter(i => i >= 0)
    series = [
      ...nombres.map((n, i) => ({ key: `v_${i}`, label: varios ? n : 'Tensión', color: color(n) })),
      ...consignas.map(i => ({ key: `vConsigna_${i}`, label: consignas.length > 1 ? `Consigna ${bancos.find(b => b.regs.some(r => r.name === nombres[i]))?.banco ?? nombres[i]}` : 'Consigna', color: varios ? SERIE_NEUTRA : '#C9932E' })),
    ]
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <SelectorCampo cfgs={regs} seleccion={nombres} onChange={setSel} multiple />
      {tipo === 'tap'
        ? <TrendChart title={`Posición de tap — ${titulo}`} data={datos} step unit="" height={240} decimals={0} rangeFetch={rf} series={series} />
        : <TrendChart title={`Tensión de carga y consigna — ${titulo} (V)`} data={datos} unit="V" height={240} yDomain={['auto', 'auto']} rangeFetch={rf} series={series} />}
    </div>
  )
}

export default function RegsTab({ data, since, until, fetchRange }: {
  data: CampoResp | null
  since: number
  until: number
  fetchRange?: Rango
}) {
  const regs = (useConfigStore(s => s.config)?.reguladores || []).filter(c => c.enabled !== false)
  const conLibres = regs.some(c => { const p = puntosLibres(c); return p.meds.length > 0 || p.senales.length > 0 })
  const primero = porBanco(regs)[0]?.regs ?? []
  if (regs.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reguladores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reguladores requiere InfluxDB.</div>

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <GraficoRegs tipo="tap" regs={regs} data={data} since={since} until={until} fetchRange={fetchRange} />
        <GraficoRegs tipo="v" regs={regs} data={data} since={since} until={until} fetchRange={fetchRange} />
      </div>
      {/* mediciones libres y perfil entre equipos: a pedido, para no recargar la vista */}
      {conLibres && <details className="bg-card border group">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold tracking-widest uppercase list-none flex items-center gap-2">
          <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>Más mediciones
        </summary>
        <div className="p-3 border-t flex flex-col gap-4">
          <LibresTrend kind="reg" cfgs={regs} name={primero[0]?.name ?? regs[0].name} data={data} since={since} until={until} fetchRange={fetchRange} />
        </div>
      </details>}
    </div>
  )
}
