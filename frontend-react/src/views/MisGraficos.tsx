// Tendencias → Mis gráficos: cada usuario arma sus propios gráficos con el botón «+»,
// mezclando variables de bombas, medidores, reconectadores, reguladores y generadores, y elige el
// color de cada traza. Se guardan en el servidor, por usuario (migran desde el navegador la primera vez).
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, X } from 'lucide-react'
import TrendChart from '../components/TrendChart'
import { PALETA_DEFECTO } from '@/lib/paleta'

// Color por defecto de una traza nueva: hex efectivo del token de serie (el <input type="color"> no acepta var())
const colorNuevo = (i: number) => {
  const n = i % PALETA_DEFECTO.series.length
  return getComputedStyle(document.documentElement).getPropertyValue(`--serie-${n + 1}`).trim() || PALETA_DEFECTO.series[n]
}
import { useConfigStore } from '../store/config'
import { useDrivesStore, selectDriveList, type HistoryPoint, type MeterPoint } from '../store/drives'
import { useAuthStore } from '../store/auth'
import { usePrefs, claveLocalGraficos } from '../store/prefs'
import { VARIABLES, TIPO, varDe, armar, type Src, type Traza, type Grafico, type Datos } from '../lib/misGraficos'

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

function leer(user: string): Grafico[] {
  try { const g = JSON.parse(localStorage.getItem(claveLocalGraficos(user)) || '[]'); return Array.isArray(g) ? g : [] } catch { return [] }
}

export default function MisGraficos({ data, since, until, fetchRange }: {
  data: Datos | null   // null = sin InfluxDB → buffer en memoria
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<Datos>
}) {
  const user = useAuthStore(s => s.user)
  const estado = usePrefs(s => s.estado)
  const delServidor = usePrefs(s => s.misGraficos)
  const [graficos, setGraficosRaw] = useState<Grafico[]>(() => usePrefs.getState().misGraficos ?? leer(user))
  const editado = useRef(false)   // true desde la primera edición del usuario: ya no se pisa con lo que llegue del servidor
  const setGraficos: typeof setGraficosRaw = f => { editado.current = true; setGraficosRaw(f) }
  // Si las prefs terminan de cargar después de montar, se adoptan (una vez, mientras no se haya editado)
  useEffect(() => { if (estado === 'listo' && delServidor && !editado.current) setGraficosRaw(delServidor) }, [estado, delServidor])
  const [editando, setEditando] = useState<string | null>(null)
  // Guardado en el servidor con debounce; con la carga fallida no se guarda (lo local es solo lectura)
  useEffect(() => {
    if (!editado.current || estado !== 'listo') return
    const t = setTimeout(() => {
      usePrefs.getState().guardar('misGraficos', graficos).catch((e: Error) => toast.error(`No se pudo guardar: ${e.message}`))
    }, 800)
    return () => clearTimeout(t)
  }, [graficos, estado])

  const cfg = useConfigStore(s => s.config)
  const drives = useDrivesStore(s => s.drives)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const meterHistory = useDrivesStore(s => s.meterHistory)
  const equipos = useMemo(() => {
    const e: Record<Src, { name: string; label: string }[]> = {
      drive: selectDriveList(drives).map(d => ({ name: d.name, label: d.displayName ?? d.name })),
      meter: (cfg?.meters || []).filter(m => m?.name).map(m => ({ name: m.name, label: cfg?.meterNames?.[m.name] || m.name })),
      reco: (cfg?.reconectadores || []).map(c => ({ name: c.name, label: c.name })),
      reg: (cfg?.reguladores || []).filter(c => c.enabled !== false).map(c => ({ name: c.name, label: c.name })),
      gen: (cfg?.generadores || []).filter(c => c.enabled !== false).map(c => ({ name: c.name, label: c.name })),
    }
    return e
  }, [drives, cfg])
  const etiqueta = (t: Traza) => `${equipos[t.src].find(e => e.name === t.name)?.label ?? t.name} · ${varDe(t)?.label ?? t.field}`

  const cambiar = (id: string, f: (g: Grafico) => Grafico) => setGraficos(gs => gs.map(g => (g.id === id ? f(g) : g)))
  const nuevo = () => {
    const src: Src = equipos.drive.length ? 'drive' : 'meter'
    const g: Grafico = { id: Date.now().toString(36), titulo: '', trazas: equipos[src][0] ? [{ src, name: equipos[src][0].name, field: VARIABLES[src][0].field, color: colorNuevo(0) }] : [] }
    setGraficos(gs => [...gs, g]); setEditando(g.id)
  }
  const sel = 'border border-border bg-background px-2 min-h-[30px] text-sm'

  return (
    <div className="flex flex-col gap-4">
      {graficos.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">Armá tus propios gráficos con las variables que quieras comparar.</div>
      )}
      {graficos.map(g => {
        const unidades = [...new Set(g.trazas.map(t => varDe(t)?.unit ?? ''))]
        const unit = unidades.length === 1 ? unidades[0] : ''
        const titulo = g.titulo || (g.trazas.length ? g.trazas.map(etiqueta).join(' / ') : 'Gráfico sin variables')
        const series = g.trazas.map((t, i) => ({ key: `t${i}`, label: etiqueta(t), color: t.color }))
        const filas = data ? armar(data, g.trazas).filter(p => (since === 0 || p.ts >= since) && p.ts <= until)
          : armarBuffer(g.trazas, driveHistory, meterHistory, since, until)
        const abierto = editando === g.id
        return (
          <section key={g.id} className="flex flex-col gap-2">
            <TrendChart key={g.trazas.map(t => t.src + t.name + t.field).join()} title={titulo + (unit ? ` (${unit})` : '')} data={filas} series={series}
              unit={unit} height={220} yDomain={['auto', 'auto']} decimals={unit === '' || unit === 'kV' ? 2 : 0}
              rangeFetch={fetchRange && ((from, to, ws) => fetchRange(from, to, ws).then(d => armar(d, g.trazas)))} />
            <div className="flex items-center gap-2 text-xs">
              <button type="button" onClick={() => setEditando(abierto ? null : g.id)} aria-expanded={abierto}
                className="border border-border bg-background px-2.5 min-h-[28px] hover:text-foreground text-muted-foreground">{abierto ? 'Listo' : 'Editar'}</button>
              <button type="button" onClick={() => setGraficos(gs => gs.filter(x => x.id !== g.id))} title="Quitar gráfico"
                className="border border-border bg-background px-2 min-h-[28px] text-muted-foreground hover:text-foreground flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" />Quitar</button>
            </div>
            {abierto && (
              <div className="bg-card border p-3 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">Título
                  <input value={g.titulo} placeholder="automático" onChange={e => cambiar(g.id, x => ({ ...x, titulo: e.target.value }))} className={sel + ' flex-1 max-w-sm'} />
                </label>
                {g.trazas.map((t, i) => {
                  const set = (p: Partial<Traza>) => cambiar(g.id, x => ({ ...x, trazas: x.trazas.map((y, j) => (j === i ? { ...y, ...p } : y)) }))
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input type="color" value={t.color} onChange={e => set({ color: e.target.value })} aria-label="Color de la traza"
                        className="h-[30px] w-9 border border-border bg-background p-0.5 cursor-pointer" />
                      <select value={t.src} aria-label="Tipo de equipo" className={sel}
                        onChange={e => { const src = e.target.value as Src; set({ src, name: equipos[src][0]?.name ?? '', field: VARIABLES[src][0].field }) }}>
                        {(Object.keys(TIPO) as Src[]).filter(s => equipos[s].length).map(s => <option key={s} value={s}>{TIPO[s]}</option>)}
                      </select>
                      <select value={t.name} onChange={e => set({ name: e.target.value })} aria-label="Equipo" className={sel}>
                        {equipos[t.src].map(e => <option key={e.name} value={e.name}>{e.label}</option>)}
                      </select>
                      <select value={t.field} onChange={e => set({ field: e.target.value })} aria-label="Variable" className={sel}>
                        {VARIABLES[t.src].map(v => <option key={v.field} value={v.field}>{v.label}{v.unit ? ` (${v.unit})` : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => cambiar(g.id, x => ({ ...x, trazas: x.trazas.filter((_, j) => j !== i) }))} aria-label="Quitar traza"
                        className="text-muted-foreground hover:text-foreground p-1"><X className="h-4 w-4" /></button>
                    </div>
                  )
                })}
                <button type="button" className="self-start border border-dashed border-border px-2.5 min-h-[28px] text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => cambiar(g.id, x => { const u = x.trazas[x.trazas.length - 1]; const src = u?.src ?? 'drive'
                    return { ...x, trazas: [...x.trazas, { src, name: u?.name ?? equipos[src][0]?.name ?? '', field: u?.field ?? VARIABLES[src][0].field, color: colorNuevo(x.trazas.length) }] } })}>
                  <Plus className="h-3.5 w-3.5" />Agregar variable
                </button>
                {unidades.length > 1 && <p className="text-[11px] text-muted-foreground">Ojo: este gráfico mezcla unidades ({unidades.filter(Boolean).join(', ')}) en un mismo eje.</p>}
              </div>
            )}
          </section>
        )
      })}
      <button type="button" onClick={nuevo}
        className="self-start flex items-center gap-2 border border-dashed border-border bg-card px-4 min-h-[44px] text-xs font-semibold tracking-widest uppercase text-muted-foreground hover:text-foreground">
        <Plus className="h-4 w-4" />Agregar gráfico
      </button>
    </div>
  )
}
