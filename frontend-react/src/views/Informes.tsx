import { useEffect, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { Download, Loader2, FileSpreadsheet, Play, Plus, Pencil, Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '../store/auth'
import { SERIE_COLORES } from '../components/TrendChart'
import EditorPlantilla, { type PlantillaForm } from '../components/EditorPlantilla'
import SuscripcionesInforme from '../components/SuscripcionesInforme'
import { useAuthStore, isAdminRole } from '../store/auth'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// Estructura que devuelve POST /api/reports/informe (services/informes.js)
interface Col { label: string; dec?: number }
type Celda = string | number | null
interface Parte {
  kpis?: { label: string; valor: Celda; unidad: string; dec?: number }[]
  tabla?: { titulo?: string; columnas: Col[]; filas: Celda[][]; total?: Celda[]; decFilas?: number[] }
  grafico?: { x: string[]; series: { label: string; unidad: string; valores: (number | null)[] }[] }
  nota?: string
}
interface Informe { plantilla: string; titulo: string; desde: string; hasta: string; generado: string; bloques: { tipo: string; titulo: string; partes: Parte[] }[] }
interface Plantilla { id: string; nombre: string; periodo: string; bloques: string[]; fabrica?: boolean }

const BLOQUES_DEMO: Record<string, string> = {
  indicadores: 'Indicadores del período', grafico_dia: 'Energía y volumen por día', por_dia: 'Detalle por día', bombas: 'Disponibilidad por bomba',
  eventos: 'Eventos y alarmas', calidad: 'Calidad de energía', mantenimiento: 'Mantenimiento', comparativo: 'Comparativo con el período anterior',
  arranques: 'Arranques por bomba', demanda: 'Demanda', perdidas: 'Pérdidas por día', lluvia: 'Lluvia y bombeo',
}
const PLANTILLAS_DEMO: Plantilla[] = [
  { id: 'mensual', nombre: 'Mensual', periodo: 'mes_anterior', bloques: [], fabrica: true },
  { id: 'disponibilidad', nombre: 'Disponibilidad', periodo: 'mes', bloques: [], fabrica: true },
  { id: 'eventos', nombre: 'Eventos y alarmas', periodo: '7d', bloques: [], fabrica: true },
  { id: 'calidad', nombre: 'Calidad de energía', periodo: 'mes', bloques: [], fabrica: true },
  { id: 'mantenimiento', nombre: 'Mantenimiento', periodo: 'mes', bloques: [], fabrica: true },
  { id: 'comparativo', nombre: 'Comparativo mensual', periodo: 'mes_anterior', bloques: [], fabrica: true },
  { id: 'demanda', nombre: 'Demanda', periodo: 'mes', bloques: [], fabrica: true },
  { id: 'perdidas', nombre: 'Pérdidas', periodo: 'mes', bloques: [], fabrica: true },
  { id: 'lluvia', nombre: 'Lluvia y bombeo', periodo: 'mes', bloques: [], fabrica: true },
]

const pad = (n: number) => String(n).padStart(2, '0')
const aInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Períodos: [desde, hasta) en días locales
function periodo(p: string): [string, string] {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const man = new Date(hoy); man.setDate(man.getDate() + 1)
  const d = (x: Date, n: number) => { const r = new Date(x); r.setDate(r.getDate() + n); return r }
  if (p === 'ayer') return [aInput(d(hoy, -1)), aInput(hoy)]
  if (p === '7d') return [aInput(d(hoy, -6)), aInput(man)]
  if (p === 'mes') return [aInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), aInput(man)]
  if (p === 'mes_anterior') return [aInput(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), aInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1))]
  return [aInput(hoy), aInput(man)]
}
const PERIODOS: [string, string][] = [['hoy', 'HOY'], ['ayer', 'AYER'], ['7d', '7 DÍAS'], ['mes', 'MES EN CURSO'], ['mes_anterior', 'MES ANTERIOR']]

const num = (v: Celda, d = 0) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }) : v)
const fFecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
// "Informe Cliente (copia)" → "informe-cliente-copia" para el nombre del archivo
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'informe'
const CTRL = 'inline-flex items-center gap-1.5 border border-border bg-background px-2.5 min-h-[30px] text-[11px] font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50'

// Demo sin backend: un informe de muestra con la misma estructura
function informeDemo(p: Plantilla, desde: string, hasta: string): Informe {
  const dias = Math.max(1, Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400_000))
  const x = Array.from({ length: Math.min(dias, 31) }, (_, i) => { const d = new Date(`${desde}T00:00:00`); d.setDate(d.getDate() + i); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` })
  const e = x.map((_, i) => 6800 + Math.round(900 * Math.sin(i / 2))), v = e.map(k => Math.round(k * 3.6))
  return {
    plantilla: p.id, titulo: `Informe ${p.nombre.toLowerCase()} (demo)`, desde: `${desde}T00:00:00`, hasta: `${hasta}T00:00:00`, generado: new Date().toISOString(),
    bloques: [
      { tipo: 'indicadores', titulo: 'Indicadores del período', partes: [{ kpis: [
        { label: 'ENERGÍA BOMBAS', valor: e.reduce((a, b) => a + b, 0), unidad: 'kWh' }, { label: 'VOLUMEN BOMBEADO', valor: v.reduce((a, b) => a + b, 0), unidad: 'm³' },
        { label: 'kWh / m³', valor: 0.278, unidad: '', dec: 3 }, { label: 'HORAS DE MARCHA', valor: 412.5, unidad: 'h', dec: 1 }, { label: 'DEMANDA MÁXIMA', valor: 2884, unidad: 'kW' }] }] },
      { tipo: 'grafico_dia', titulo: 'Energía y volumen por día', partes: [{ grafico: { x, series: [{ label: 'Energía bombas', unidad: 'kWh', valores: e }, { label: 'Volumen', unidad: 'm³', valores: v }] } }] },
      { tipo: 'bombas', titulo: 'Disponibilidad por bomba', partes: [{ tabla: {
        columnas: [{ label: 'Bomba' }, { label: 'Horas marcha', dec: 1 }, { label: '% del período', dec: 1 }, { label: 'Horas en falla', dec: 1 }, { label: 'Energía kWh', dec: 1 }, { label: 'Fallas', dec: 0 }],
        filas: [['SAER 1', 210.4, 87.7, 0, 52100.5, 0], ['SAER 2', 198.2, 82.6, 3.5, 48800.2, 2], ['SAER 3', 4.1, 1.7, 0, 980.4, 0]] } }] },
      { tipo: 'nota', titulo: 'Vista previa', partes: [{ nota: 'Datos de muestra: en producción el informe se calcula en el servidor con el histórico completo.' }] },
    ],
  }
}

function Kpis({ ks }: { ks: NonNullable<Parte['kpis']> }) {
  return (
    <section className="grid gap-px border bg-border" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {ks.map(k => (
        <div key={k.label} className="bg-card px-3.5 py-2.5 flex flex-col justify-between gap-0.5">
          <span className="text-[11px] text-muted-foreground tracking-widest truncate" title={k.label}>{k.label}</span>
          <span className="font-mono text-2xl font-medium tabular-nums">{num(k.valor, k.dec ?? 0)} <span className="text-[13px] text-muted-foreground">{k.unidad}</span></span>
        </div>
      ))}
    </section>
  )
}

function Tabla({ t }: { t: NonNullable<Parte['tabla']> }) {
  const td = (v: Celda, k: number, neg = false, decF?: number) => (
    <td key={k} className={`px-3 py-1.5 whitespace-nowrap ${k === 0 ? 'text-left' : 'text-right font-mono tabular-nums'} ${neg ? 'font-semibold' : ''}`}>{k === 0 ? (v ?? '—') : num(v, t.columnas[k]?.dec ?? decF ?? 0)}</td>
  )
  return (
    <div>
      {t.titulo && <h4 className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">{t.titulo}</h4>}
      <div className="overflow-x-auto border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] tracking-wider text-muted-foreground bg-muted/50">
              {t.columnas.map((c, k) => <th key={c.label} scope="col" className={`px-3 py-2 font-medium border-b whitespace-nowrap ${k === 0 ? 'text-left' : 'text-right'}`}>{c.label.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.filas.length ? t.filas.map((f, i) => <tr key={i} className="border-b border-border/60">{f.map((v, k) => td(v, k, false, t.decFilas?.[i]))}</tr>)
              : <tr><td colSpan={t.columnas.length} className="px-3 py-4 text-muted-foreground">Sin datos en el período.</td></tr>}
          </tbody>
          {t.total && <tfoot><tr className="border-t-2 border-border">{t.total.map((v, k) => td(v, k, true))}</tr></tfoot>}
        </table>
      </div>
    </div>
  )
}

function Grafico({ g }: { g: NonNullable<Parte['grafico']> }) {
  const data = g.x.map((x, i) => Object.fromEntries([['x', x], ...g.series.map((s, k) => [`s${k}`, s.valores[i]])]))
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="x" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" tickLine={false} />
          <YAxis yAxisId={0} tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={60} />
          {g.series[1] && <YAxis yAxisId={1} orientation="right" tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={60} />}
          <Tooltip formatter={(v: number, name: string) => [num(v, Math.abs(v) < 100 ? 2 : 0), name]} contentStyle={{ fontSize: 11, borderRadius: 2, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))', fontFamily: 'IBM Plex Mono, monospace' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: 'hsl(var(--foreground))' }}>{v}</span>} />
          <Bar yAxisId={0} dataKey="s0" name={`${g.series[0].label} (${g.series[0].unidad})`} fill={SERIE_COLORES[0]} isAnimationActive={false} />
          {g.series[1] && <Line yAxisId={1} dataKey="s1" name={`${g.series[1].label} (${g.series[1].unidad})`} stroke={SERIE_COLORES[3]} strokeWidth={2} dot={false} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// Reportes → Informes: plantilla + período → bloques en pantalla, PDF y XLSX
export default function Informes() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>(PLANTILLAS_DEMO)
  const [sel, setSel] = useState('mensual')
  const [[desde, hasta], setRango] = useState<[string, string]>(periodo('mes_anterior'))
  const [inf, setInf] = useState<Informe | null>(null)
  const [cargando, setCargando] = useState(false)
  const [bajando, setBajando] = useState<null | 'pdf' | 'xlsx'>(null)
  const [error, setError] = useState('')
  const [catalogo, setCatalogo] = useState<Record<string, string>>(BLOQUES_DEMO)
  const [form, setForm] = useState<PlantillaForm | null>(null)
  const isAdmin = useAuthStore(s => isAdminRole(s.role))

  const recargar = () => {
    if (MODE === 'mock') return Promise.resolve()
    return authFetch(`${API_BASE}/reports/informes`).then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.plantillas?.length) setPlantillas(j.plantillas); if (j?.bloques) setCatalogo(j.bloques) }).catch(() => {})
  }
  useEffect(() => { recargar() }, [])

  // Plantillas propias: alta/edición (POST/PUT) y baja; en demo quedan en memoria
  async function guardarPlantilla(f: PlantillaForm) {
    if (MODE === 'mock') {
      const id = f.id ?? `p-demo-${Date.now()}`
      setPlantillas(ps => [...ps.filter(p => p.id !== id), { ...f, id, fabrica: false }]); setForm(null); elegirNueva(id, f.periodo); return
    }
    const r = await authFetch(`${API_BASE}/reports/informes/plantillas${f.id ? `/${f.id}` : ''}`, { method: f.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    await recargar(); setForm(null); elegirNueva(j.id, j.periodo)
    toast.success(f.id ? 'Plantilla actualizada' : 'Plantilla creada')
  }
  async function borrarPlantilla(p: Plantilla) {
    if (!window.confirm(`¿Borrar la plantilla «${p.nombre}»?`)) return
    if (MODE !== 'mock') {
      const r = await authFetch(`${API_BASE}/reports/informes/plantillas/${p.id}`, { method: 'DELETE' })
      if (!r.ok) { toast.error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`); return }
      await recargar()
    } else setPlantillas(ps => ps.filter(x => x.id !== p.id))
    elegir('mensual')
  }
  const elegirNueva = (id: string, per: string) => { setSel(id); setInf(null); setRango(periodo(per)) }

  const plantilla = plantillas.find(p => p.id === sel) ?? plantillas[0]
  const elegir = (id: string) => { setSel(id); setInf(null); const p = plantillas.find(x => x.id === id); if (p) setRango(periodo(p.periodo)) }
  // hasta es exclusivo en el servidor: el input muestra el último día incluido
  const cuerpo = () => ({ plantilla: plantilla.id, from: new Date(`${desde}T00:00:00`).toISOString(), to: new Date(`${hasta}T00:00:00`).toISOString() })
  const ultimoDia = (() => { const d = new Date(`${hasta}T00:00:00`); d.setDate(d.getDate() - 1); return aInput(d) })()

  async function generar() {
    setError(''); setCargando(true)
    try {
      if (MODE === 'mock') { await new Promise(r => setTimeout(r, 300)); setInf(informeDemo(plantilla, desde, hasta)); return }
      const r = await authFetch(`${API_BASE}/reports/informe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo()) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setInf(j)
    } catch (e: any) { setError(e.message); setInf(null) } finally { setCargando(false) }
  }

  async function bajar(fmt: 'pdf' | 'xlsx') {
    if (MODE === 'mock') { toast.info('Vista previa: en producción el archivo se genera en el servidor'); return }
    setBajando(fmt)
    try {
      const r = await authFetch(`${API_BASE}/reports/informe/${fmt}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo()) })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a'); a.href = url; a.download = `informe-${slug(plantilla.nombre)}_${desde}_${ultimoDia}.${fmt}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { toast.error(`No se pudo generar el archivo: ${e.message}`) } finally { setBajando(null) }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Plantilla */}
      <nav aria-label="Tipo de informe" className="flex flex-wrap bg-card border">
        {plantillas.map(p => (
          <button key={p.id} type="button" onClick={() => elegir(p.id)} aria-pressed={sel === p.id}
            className={`px-4 min-h-[44px] text-xs font-semibold tracking-widest uppercase whitespace-nowrap border-b-[3px] transition-colors ${sel === p.id ? 'border-foreground text-foreground bg-muted' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {p.nombre}
          </button>
        ))}
        {isAdmin && (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1.5">
            {plantilla && !plantilla.fabrica && <>
              <button type="button" onClick={() => setForm({ id: plantilla.id, nombre: plantilla.nombre, periodo: plantilla.periodo, bloques: plantilla.bloques })} className={CTRL}><Pencil className="h-3.5 w-3.5" />EDITAR</button>
              <button type="button" onClick={() => borrarPlantilla(plantilla)} className={CTRL}><Trash2 className="h-3.5 w-3.5" />BORRAR</button>
            </>}
            {plantilla && <button type="button" onClick={() => setForm({ nombre: `${plantilla.nombre} (copia)`, periodo: plantilla.periodo, bloques: plantilla.bloques.length ? plantilla.bloques : ['indicadores'] })} className={CTRL} title="Crear una plantilla propia a partir de esta"><Copy className="h-3.5 w-3.5" />DUPLICAR</button>}
            <button type="button" onClick={() => setForm({ nombre: '', periodo: 'mes', bloques: ['indicadores'] })} className={CTRL}><Plus className="h-3.5 w-3.5" />NUEVA</button>
          </div>
        )}
      </nav>
      <EditorPlantilla inicial={form} catalogo={catalogo} onGuardar={guardarPlantilla} onCerrar={() => setForm(null)} />

      {/* Período y acciones */}
      <div className="flex flex-wrap items-center gap-2 bg-card border px-3 min-h-[44px] py-1.5">
        <span className="text-[11px] tracking-widest text-muted-foreground">PERÍODO</span>
        {PERIODOS.map(([k, l]) => <button key={k} type="button" onClick={() => { setRango(periodo(k)); setInf(null) }} className={CTRL}>{l}</button>)}
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">DESDE
          <input type="date" value={desde} onChange={e => { setRango([e.target.value, hasta]); setInf(null) }} className="border border-border bg-background px-2 min-h-[30px] text-xs font-mono text-foreground" />
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">HASTA
          <input type="date" value={ultimoDia} min={desde} onChange={e => { const d = new Date(`${e.target.value}T00:00:00`); d.setDate(d.getDate() + 1); setRango([desde, aInput(d)]); setInf(null) }}
            className="border border-border bg-background px-2 min-h-[30px] text-xs font-mono text-foreground" />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={generar} disabled={cargando}
            className="inline-flex items-center gap-1.5 px-3 min-h-[30px] text-[11px] font-semibold tracking-wider bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{cargando ? 'CALCULANDO…' : 'GENERAR'}
          </button>
          <button type="button" onClick={() => bajar('pdf')} disabled={!inf || bajando !== null} className={CTRL}>
            {bajando === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}PDF
          </button>
          <button type="button" onClick={() => bajar('xlsx')} disabled={!inf || bajando !== null} className={CTRL}>
            {bajando === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}XLSX
          </button>
        </div>
      </div>

      {isAdmin && plantilla && <SuscripcionesInforme plantilla={plantilla.id} nombre={plantilla.nombre} />}

      {error && <div role="alert" className="border bg-card px-3 py-2 text-sm" style={{ borderColor: 'var(--p1)', boxShadow: 'inset 4px 0 0 var(--p1)', color: 'var(--p1-text)' }}>No se pudo generar el informe: {error}</div>}

      {!inf && !cargando && !error && (
        <div className="bg-card border px-4 py-10 text-center text-sm text-muted-foreground">
          Elegí el tipo de informe y el período, y tocá <strong className="text-foreground">GENERAR</strong>. Los períodos largos pueden tardar unos segundos la primera vez.
        </div>
      )}

      {inf && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 px-1">
            <h2 className="text-sm font-bold tracking-widest uppercase">{inf.titulo}</h2>
            <span className="text-[11px] font-mono text-muted-foreground">{fFecha(inf.desde)} — {fFecha(inf.hasta)} · generado {fFecha(inf.generado)}</span>
          </div>
          {inf.bloques.map((b, i) => (
            <section key={i} aria-label={b.titulo} className="bg-card border">
              <header className="px-3 py-2 border-b"><h3 className="text-xs font-bold tracking-widest uppercase">{b.titulo}</h3></header>
              <div className="p-3 flex flex-col gap-4">
                {b.partes.map((p, k) => (
                  <div key={k}>
                    {p.kpis && <Kpis ks={p.kpis} />}
                    {p.tabla && <Tabla t={p.tabla} />}
                    {p.grafico && <Grafico g={p.grafico} />}
                    {p.nota && <p className="text-xs text-muted-foreground italic">{p.nota}</p>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
