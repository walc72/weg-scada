// Tendencias de puntos libres (med/senal) de Reguladores y Reconectadores (spec §5.3):
// «Otras mediciones» del equipo, franjas de señales y «Perfil entre equipos».
import { useMemo, useState } from 'react'
import TrendChart from './TrendChart'
import { puntosLibres } from './CampoBase'
import { FASOR_COLORES } from './Fasorial'
import slug from '../lib/slug'
import type { CampoConfig } from '../types'
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
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{titulo}</p>
      <div className="flex h-5 w-full overflow-hidden rounded border border-border">
        {bloques.map(b => <div key={b.key} className="flex-1" style={{ background: b.color }} title={b.title} />)}
      </div>
      <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
        {leyenda.map(([t, c]) => <span key={t} className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{t}</span>)}
      </div>
    </div>
  )
}

export default function LibresTrend({ kind, cfgs, name, data, since, until, fetchRange }: {
  kind: 'reco' | 'reg'
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
  const [perfil, setPerfil] = useState('')
  const nombres = useMemo(() => [...new Set(cfgs.flatMap(c => puntosLibres(c).meds.map(m => m.nombre!)))], [cfgs])
  const pf = nombres.includes(perfil) ? perfil : ''
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
  // perfil: una serie por equipo (e0, e1…) con la medición elegida
  const perfilChart = (rs: CampoRow[]): Fila[] => {
    const f = 'x_' + slug(pf), m = new Map<number, Fila>()
    for (const r of rs) {
      const i = cfgs.findIndex(c => c.name === r.name), v = r[f]
      if (i < 0 || typeof v !== 'number' || isNaN(v)) continue
      const ts = new Date(r._time).getTime()
      const o = m.get(ts) ?? { ts }
      o['e' + i] = v; m.set(ts, o)
    }
    return [...m.values()].sort((a, b) => a.ts - b.ts)
  }
  const todas = useMemo(() => (data.campo || []).filter((r: CampoRow) => r.kind === kind), [data, kind])
  const unidadPerfil = cfgs.flatMap(c => puntosLibres(c).meds).find(m => m.nombre === pf)
  const conPerfil = cfgs.map((c, i) => ({ c, i })).filter(({ c }) => puntosLibres(c).meds.some(m => m.nombre === pf))
  const rowsSen = useMemo(() => todas.filter(r => r.name === name && enRango(new Date(r._time).getTime(), since, until))
    .sort((a, b) => a._time.localeCompare(b._time)), [todas, name, since, until])

  if (nombres.length === 0 && senales.length === 0) return null
  const chip = (activo: boolean) => `rounded-full border px-2.5 py-0.5 text-xs ${activo ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`

  return (
    <>
      {(meds.length > 0 || senales.length > 0) && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Otras mediciones — {name}</p>
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
                series={ps.map((p, i) => ({ key: campos[i], label: p.nombre!, color: FASOR_COLORES[meds.indexOf(p) % FASOR_COLORES.length] }))} />
            )
          })}
          {sAct.map(s => {
            const f = 's_' + slug(s.nombre!)
            return <Franja key={s.nombre} titulo={`${s.nombre} — ${name}`}
              bloques={rowsSen.map(r => { const on = Number(r[f]) >= 0.5; return { key: r._time, color: on ? '#22c55e' : '#94a3b8', title: `${new Date(r._time).toLocaleString('es-AR')} — ${on ? 'activa' : 'inactiva'}` } })}
              leyenda={[['activa', '#22c55e'], ['inactiva', '#94a3b8']]} />
          })}
        </div>
      )}
      {nombres.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perfil entre equipos</p>
          <select value={pf} onChange={e => setPerfil(e.target.value)} className="self-start rounded-md border border-border bg-background px-2 py-1 text-sm">
            <option value="">Elegí una medición…</option>
            {nombres.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {pf && (
            <TrendChart title={`${pf} por equipo${unidadPerfil?.unidad ? ` (${unidadPerfil.unidad})` : ''}`}
              data={perfilChart(todas).filter(p => enRango(p.ts, since, until))} unit={unidadPerfil?.unidad ?? ''}
              height={260} decimals={unidadPerfil?.decimales ?? 0} yDomain={['auto', 'auto']}
              rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => perfilChart(filas(d))))}
              series={conPerfil.map(({ c, i }) => ({ key: 'e' + i, label: c.name, color: FASOR_COLORES[i % FASOR_COLORES.length] }))} />
          )}
        </div>
      )}
    </>
  )
}
