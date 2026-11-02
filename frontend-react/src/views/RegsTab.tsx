// Tendencias → Reguladores (módulo unifilar): tap (escalonado) y tensión vs consigna. Por defecto el
// banco completo (las fases juntas, con sus colores de fase); también un regulador solo.
import { useMemo, useState } from 'react'
import TrendChart, { SERIE_NEUTRA, type SeriesDef } from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { puntosLibres } from '../components/CampoBase'
import LibresTrend from '../components/LibresTrend'
import SelectorCampo from '../components/SelectorCampo'
import { FASOR_COLORES, porBanco } from '../components/Fasorial'
import type { CampoResp, CampoRow } from './RecosTab'

type Fila = Record<string, number>
const enRango = (t: number, since: number, until: number) => (since === 0 || t >= since) && t <= until

// Une por tiempo los campos de varios reguladores: clave `${campo}_${i}` (i = fase)
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

export default function RegsTab({ data, since, until, fetchRange }: {
  data: CampoResp | null
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<CampoResp>
}) {
  const regs = (useConfigStore(s => s.config)?.reguladores || []).filter(c => c.enabled !== false)
  const bancos = porBanco(regs)
  // cada regulador se prende y apaga por separado; de entrada, las fases del primer banco
  const [sel, setSel] = useState<string[]>([])
  const validos = sel.filter(n => regs.some(r => r.name === n))
  const grupo = validos.length ? regs.filter(r => validos.includes(r.name)) : (bancos.find(g => g.banco && g.regs.length > 1)?.regs ?? regs.slice(0, 1))
  const nombres = grupo.map(r => r.name)
  const clave = nombres.join('|')
  const banco = bancos.find(g => g.banco && g.regs.length === grupo.length && g.regs.every(r => nombres.includes(r.name)))
  const titulo = banco ? banco.banco! : nombres.join(', ')

  const filas = (d: CampoResp | null) => (d?.campo || []).filter(r => r.kind === 'reg')
  const tap = useMemo(() => unir(filas(data), nombres, ['tap']).filter(p => enRango(p.ts, since, until)), [data, clave, since, until])
  const volt = useMemo(() => unir(filas(data), nombres, ['v', 'vConsigna']).filter(p => enRango(p.ts, since, until)), [data, clave, since, until])
  const rf = (campos: string[]) => fetchRange && ((from: string, to: string, ws: number) => fetchRange(from, to, ws).then(d => unir(filas(d), nombres, campos)))

  const conLibres = regs.some(c => { const p = puntosLibres(c); return p.meds.length > 0 || p.senales.length > 0 })
  if (regs.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reguladores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reguladores requiere InfluxDB.</div>

  // un color fijo por regulador (su posición dentro del banco, como en Equipos); uno solo, neutro
  const color = (n: string) => {
    if (nombres.length === 1) return SERIE_NEUTRA
    const g = bancos.find(b => b.regs.some(r => r.name === n))!
    return FASOR_COLORES[g.regs.findIndex(r => r.name === n) % FASOR_COLORES.length]
  }
  const seriesTap: SeriesDef[] = nombres.map((n, i) => ({ key: `tap_${i}`, label: nombres.length > 1 ? n : 'Tap', color: color(n) }))
  // consigna: una por banco (la del primer regulador elegido de cada banco)
  const consignas = bancos.map(b => nombres.findIndex(n => b.regs.some(r => r.name === n))).filter(i => i >= 0)
  const seriesV: SeriesDef[] = [
    ...nombres.map((n, i) => ({ key: `v_${i}`, label: nombres.length > 1 ? n : 'Tensión', color: color(n) })),
    ...consignas.map(i => ({ key: `vConsigna_${i}`, label: consignas.length > 1 ? `Consigna ${bancos.find(b => b.regs.some(r => r.name === nombres[i]))?.banco ?? nombres[i]}` : 'Consigna', color: nombres.length > 1 ? SERIE_NEUTRA : '#C9932E' })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <SelectorCampo cfgs={regs} seleccion={nombres} onChange={setSel} multiple />
      <div className="grid gap-4 xl:grid-cols-2">
        <TrendChart title={`Posición de tap — ${titulo}`} data={tap} step unit="" height={240} decimals={0} rangeFetch={rf(['tap'])} series={seriesTap} />
        <TrendChart title={`Tensión de carga y consigna — ${titulo} (V)`} data={volt} unit="V" height={240} yDomain={['auto', 'auto']} rangeFetch={rf(['v', 'vConsigna'])} series={seriesV} />
      </div>
      {/* mediciones libres y perfil entre equipos: a pedido, para no recargar la vista */}
      {conLibres && <details className="bg-card border group">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold tracking-widest uppercase list-none flex items-center gap-2">
          <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>Más mediciones
        </summary>
        <div className="p-3 border-t flex flex-col gap-4">
          <LibresTrend kind="reg" cfgs={grupo} name={nombres[0]} data={data} since={since} until={until} fetchRange={fetchRange} />
        </div>
      </details>}
    </div>
  )
}
