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
  const porDefecto = bancos.find(g => g.banco && g.regs.length > 1)
  const [sel, setSel] = useState('')
  const valido = sel.startsWith('banco:') ? bancos.some(g => `banco:${g.banco}` === sel) : regs.some(r => r.name === sel)
  const valor = valido ? sel : porDefecto ? `banco:${porDefecto.banco}` : regs[0]?.name ?? ''
  const esBanco = valor.startsWith('banco:')
  const grupo = esBanco ? bancos.find(g => `banco:${g.banco}` === valor)!.regs : regs.filter(r => r.name === valor)
  const nombres = grupo.map(r => r.name)
  const titulo = esBanco ? valor.slice(6) : valor

  const filas = (d: CampoResp | null) => (d?.campo || []).filter(r => r.kind === 'reg')
  const tap = useMemo(() => unir(filas(data), nombres, ['tap']).filter(p => enRango(p.ts, since, until)), [data, valor, since, until])
  const volt = useMemo(() => unir(filas(data), nombres, ['v', 'vConsigna']).filter(p => enRango(p.ts, since, until)), [data, valor, since, until])
  const rf = (campos: string[]) => fetchRange && ((from: string, to: string, ws: number) => fetchRange(from, to, ws).then(d => unir(filas(d), nombres, campos)))

  const conLibres = regs.some(c => { const p = puntosLibres(c); return p.meds.length > 0 || p.senales.length > 0 })
  if (regs.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reguladores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reguladores requiere InfluxDB.</div>

  // un color por fase (los mismos del banco en Equipos); la consigna, neutra y una sola (es la del banco)
  const color = (i: number) => (nombres.length > 1 ? FASOR_COLORES[i % FASOR_COLORES.length] : SERIE_NEUTRA)
  const seriesTap: SeriesDef[] = nombres.map((n, i) => ({ key: `tap_${i}`, label: nombres.length > 1 ? n : 'Tap', color: color(i) }))
  const seriesV: SeriesDef[] = [
    ...nombres.map((n, i) => ({ key: `v_${i}`, label: nombres.length > 1 ? n : 'Tensión', color: color(i) })),
    { key: 'vConsigna_0', label: 'Consigna', color: nombres.length > 1 ? SERIE_NEUTRA : '#C9932E' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SelectorCampo cfgs={regs} valor={valor} onChange={setSel} bancoCompleto />
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
          <LibresTrend kind="reg" cfgs={esBanco ? grupo : regs} name={nombres[0]} data={data} since={since} until={until} fetchRange={fetchRange} />
        </div>
      </details>}
    </div>
  )
}
