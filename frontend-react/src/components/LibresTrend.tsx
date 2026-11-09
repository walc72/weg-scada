// Tendencias de puntos libres (med/senal) de Reguladores y Reconectadores (spec §5.3):
// «Otras mediciones» del equipo y franjas de señales.
import { useMemo, useState } from 'react'
import TrendChart from './TrendChart'
import { puntosLibres } from './CampoBase'
import { colorSerie } from '../lib/paleta'
import slug from '../lib/slug'
import type { CampoConfig, CampoKind } from '../types'
import type { CampoRow, CampoResp } from '../views/RecosTab'

type Rango = (from: string, to: string, ws: number) => Promise<CampoResp>
type Fila = Record<string, number>
const enRango = (t: number, since: number, until: number) => (since === 0 || t >= since) && t <= until

// Franja de estado: un bloque por ventana, con leyenda
export function Franja({ titulo, bloques, leyenda }: {
  titulo: string
  bloques: { key: string; color: string; title: string }[]
  leyenda: [string, string][]
}) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">{titulo}</p>
      <div className="flex h-7 w-full overflow-hidden border border-border" style={{ background: 'var(--bar-track)' }}>
        {bloques.map(b => <div key={b.key} className="flex-1" style={{ background: b.color }} title={b.title} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
        {leyenda.map(([t, c]) => <span key={t} className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 border border-border" style={{ background: c }} />{t}</span>)}
      </div>
    </div>
  )
}

export default function LibresTrend({ kind, cfgs, name, data, since, until, fetchRange }: {
  kind: CampoKind
  cfgs: CampoConfig[]
  name: string
  data: CampoResp
  since: number
  until: number
  fetchRange?: Rango
}) {
  const cfg = cfgs.find(c => c.name === name)
  const { meds, senales } = useMemo(() => (cfg ? puntosLibres(cfg) : { meds: [], senales: [] }), [cfg])
  const [selM, setSelM] = useState<string[]>([])
  const [selS, setSelS] = useState<string[]>([])
  const mAct = meds.filter(m => selM.includes(m.nombre!)), sAct = senales.filter(s => selS.includes(s.nombre!))
  const toggle = (set: typeof setSelM, v: string) => set(a => a.includes(v) ? a.filter(x => x !== v) : [...a, v])

  const filas = (d: CampoResp) => (d.campo || []).filter((r: CampoRow) => r.kind === kind)
  // un gráfico por unidad (mismas unidades juntas)
  const porUnidad = [...new Set(mAct.map(m => m.unidad ?? ''))]
  const medChart = (rs: CampoRow[], campos: string[]): Fila[] => rs.filter(r => r.name === name).map(r => {
    const o: Fila = { ts: new Date(r._time).getTime() }
    for (const f of campos) { const v = r[f]; if (typeof v === 'number' && !isNaN(v)) o[f] = v }
    return o
  }).sort((a, b) => a.ts - b.ts)
  const todas = useMemo(() => (data.campo || []).filter((r: CampoRow) => r.kind === kind), [data, kind])
  const rowsSen = useMemo(() => todas.filter(r => r.name === name && enRango(new Date(r._time).getTime(), since, until))
    .sort((a, b) => a._time.localeCompare(b._time)), [todas, name, since, until])

  if (meds.length === 0 && senales.length === 0) return null
  const chip = (activo: boolean) => `border px-2.5 min-h-[28px] text-[11px] ${activo ? 'border-foreground text-foreground bg-muted font-semibold' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`

  return (
    <>
      {(meds.length > 0 || senales.length > 0) && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">Otras mediciones — {name} <span className="font-normal normal-case tracking-normal">(elegí cuáles ver)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {meds.map(m => <button key={'m' + m.nombre} type="button" className={chip(selM.includes(m.nombre!))} onClick={() => toggle(setSelM, m.nombre!)}>{m.nombre}</button>)}
            {senales.map(s => <button key={'s' + s.nombre} type="button" className={chip(selS.includes(s.nombre!))} onClick={() => toggle(setSelS, s.nombre!)}>{s.nombre} (señal)</button>)}
          </div>
          {porUnidad.map(u => {
            const ps = mAct.filter(m => (m.unidad ?? '') === u)
            const campos = ps.map(m => 'x_' + slug(m.nombre!))
            return (
              <TrendChart key={u} title={`${ps.map(p => p.nombre).join(', ')}${u ? ` (${u})` : ''} — ${name}`}
                data={medChart(todas, campos).filter(p => enRango(p.ts, since, until))} unit={u}
                height={240} decimals={ps[0].decimales ?? 0} yDomain={['auto', 'auto']}
                rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => medChart(filas(d), campos)))}
                series={ps.map((p, i) => ({ key: campos[i], label: p.nombre!, color: colorSerie(meds.indexOf(p)) }))} />
            )
          })}
          {sAct.map(s => {
            const f = 's_' + slug(s.nombre!)
            return <Franja key={s.nombre} titulo={`${s.nombre} — ${name}`}
              bloques={rowsSen.map(r => { const on = Number(r[f]) >= 0.5; return { key: r._time, color: on ? 'hsl(var(--foreground) / 0.75)' : 'transparent', title: `${new Date(r._time).toLocaleString('es-AR', { hour12: false })} — ${on ? 'activa' : 'inactiva'}` } })}
              leyenda={[['activa', 'hsl(var(--foreground) / 0.75)'], ['inactiva', 'var(--bar-track)']]} />
          })}
        </div>
      )}
    </>
  )
}

// "Más mediciones" de un equipo, plegado: sus mediciones libres y señales (si no tiene, nada)
export function MasMediciones({ kind, cfg, data, since, until, fetchRange }: {
  kind: CampoKind; cfg: CampoConfig; data: CampoResp; since: number; until: number; fetchRange?: Rango
}) {
  const { meds, senales } = puntosLibres(cfg)
  if (meds.length === 0 && senales.length === 0) return null
  return (
    <details className="bg-card border group">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold tracking-widest uppercase list-none flex items-center gap-2">
        <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>Más mediciones
        <span className="font-normal normal-case tracking-normal text-muted-foreground">{meds.length + senales.length}</span>
      </summary>
      <div className="p-3 border-t flex flex-col gap-4">
        <LibresTrend kind={kind} cfgs={[cfg]} name={cfg.name} data={data} since={since} until={until} fetchRange={fetchRange} />
      </div>
    </details>
  )
}
