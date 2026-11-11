import { useEffect, useState } from 'react'
import { Mail, Send, Pause, Play, Pencil, Trash2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '../store/auth'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API = `${(import.meta.env.VITE_API_BASE as string) || '/api'}/reports/informes/suscripciones`

export interface Suscripcion {
  id: string; plantilla: string; frecuencia: 'diaria' | 'semanal' | 'mensual'; dia: number | null; hora: string
  destinatarios: string[]; activa: boolean; proximo?: number | null; ultimoEnvio?: string; ultimoError?: string | null
  periodo?: string | null                    // null = el de la frecuencia
  proximoPeriodo?: [number, number] | null   // [desde, hasta) del próximo envío (lo calcula el servidor)
}
type Form = Omit<Suscripcion, 'id' | 'destinatarios'> & { id?: string; destinatarios: string }

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const CTRL = 'inline-flex items-center gap-1 border border-border bg-background px-2 min-h-[28px] text-[11px] font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40'
const fFecha = (v?: string | number | null) => v ? new Date(v).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'
const fDia = (v: number) => new Date(v).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const cuando = (s: Pick<Suscripcion, 'frecuencia' | 'dia' | 'hora'>) =>
  s.frecuencia === 'diaria' ? `Todos los días ${s.hora}`
  : s.frecuencia === 'semanal' ? `${DIAS[s.dia || 1]} ${s.hora}`
  : `Día 1 de cada mes ${s.hora}`
// Período del informe, respecto del día del envío (mismo cálculo que rangoSuscripcion en la API)
const PERIODO_SUS: Record<string, string> = {
  hoy: 'Hoy hasta la hora del envío', ayer: 'El día anterior', '7d': 'Los 7 días previos',
  mes: 'Mes en curso hasta el día anterior', mes_anterior: 'El mes anterior',
}
const DE_FRECUENCIA = { diaria: 'El día anterior', semanal: 'Los 7 días previos', mensual: 'El mes anterior' }
const periodoTxt = (s: Pick<Suscripcion, 'frecuencia' | 'periodo'>) => (s.periodo && PERIODO_SUS[s.periodo]) || DE_FRECUENCIA[s.frecuencia]
// [desde, hasta): hasta es exclusivo, salvo «hoy», que termina a la hora del envío
const rango = ([a, b]: [number, number]) => { const fin = fDia(b - 1); return fDia(a) === fin ? fin : `${fDia(a)} al ${fin}` }

async function api(url: string, method = 'GET', body?: unknown) {
  const r = await authFetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
  return j
}

// Suscripciones por correo de un informe (solo administradores): lista, alta, edición,
// pausa, envío inmediato y baja. El servidor manda el PDF del período en cada vencimiento.
export default function SuscripcionesInforme({ plantilla, nombre }: { plantilla: string; nombre: string }) {
  const [todas, setTodas] = useState<Suscripcion[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState('')

  const recargar = () => MODE === 'mock' ? Promise.resolve() : api(API).then(j => setTodas(j.suscripciones || [])).catch(() => {})
  useEffect(() => { recargar() }, [])
  const mias = todas.filter(s => s.plantilla === plantilla)

  async function guardar() {
    if (!form) return
    setError(''); setOcupado('form')
    try {
      const body = { ...form, plantilla, destinatarios: form.destinatarios }
      if (MODE === 'mock') {
        const id = form.id ?? `s-demo-${Date.now()}`
        setTodas(t => [...t.filter(x => x.id !== id), { ...form, id, plantilla, destinatarios: form.destinatarios.split(/[\s,;]+/).filter(Boolean), proximo: Date.now() + 86400_000 }])
      } else {
        await api(form.id ? `${API}/${form.id}` : API, form.id ? 'PUT' : 'POST', body); await recargar()
      }
      toast.success(form.id ? 'Suscripción actualizada' : 'Suscripción creada'); setForm(null)
    } catch (e: any) { setError(e.message) } finally { setOcupado(null) }
  }
  async function accion(s: Suscripcion, que: 'enviar' | 'pausa' | 'borrar') {
    if (que === 'borrar' && !window.confirm(`¿Borrar la suscripción para ${s.destinatarios.join(', ')}?`)) return
    if (MODE === 'mock') {
      if (que === 'borrar') setTodas(t => t.filter(x => x.id !== s.id))
      else if (que === 'pausa') setTodas(t => t.map(x => x.id === s.id ? { ...x, activa: !x.activa } : x))
      else toast.info('Vista previa: en producción se envía el PDF por correo')
      return
    }
    setOcupado(s.id + que)
    try {
      if (que === 'enviar') { const r = await api(`${API}/${s.id}/enviar`, 'POST'); toast.success(`Enviado (${r.periodo}) a ${r.to.length} destinatario(s)`) }
      else if (que === 'pausa') await api(`${API}/${s.id}`, 'PUT', { ...s, activa: !s.activa })
      else await api(`${API}/${s.id}`, 'DELETE')
    } catch (e: any) { toast.error(e.message) } finally { setOcupado(null); recargar() }
  }

  return (
    <section aria-label="Suscripciones por correo" className="bg-card border">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 border-b">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-bold tracking-widest uppercase">Envío por correo</h3>
        <span className="text-[11px] text-muted-foreground">{mias.length ? `${mias.length} suscripción${mias.length > 1 ? 'es' : ''}` : 'sin suscripciones'}</span>
        <button type="button" onClick={() => { setError(''); setForm({ plantilla, frecuencia: 'mensual', dia: 1, hora: '07:00', periodo: null, destinatarios: '', activa: true }) }} className={`${CTRL} ml-auto`}>
          <Plus className="h-3.5 w-3.5" />SUSCRIBIR
        </button>
      </header>
      {mias.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] tracking-wider text-muted-foreground">
                {['CUÁNDO', 'PERÍODO', 'DESTINATARIOS', 'PRÓXIMO ENVÍO', 'ÚLTIMO ENVÍO', ''].map(h => <th key={h} scope="col" className="text-left font-medium px-3 py-2 border-b">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {mias.map(s => (
                <tr key={s.id} className="border-b border-border/60 align-top">
                  <td className="px-3 py-2">{cuando(s)}{!s.activa && <span className="ml-2 text-[11px] font-bold tracking-wider" style={{ color: 'var(--p3-text)' }}>PAUSADA</span>}</td>
                  <td className="px-3 py-2">
                    {periodoTxt(s)}
                    {s.activa && s.proximoPeriodo && <div className="font-mono tabular-nums text-[11px] text-muted-foreground whitespace-nowrap" title="Período del próximo envío">{rango(s.proximoPeriodo)}</div>}
                  </td>
                  <td className="px-3 py-2 break-all">{s.destinatarios.join(', ')}</td>
                  <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">{s.activa ? fFecha(s.proximo) : '—'}</td>
                  <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                    {fFecha(s.ultimoEnvio)}
                    {s.ultimoError && <div className="font-sans text-[11px] whitespace-normal max-w-[260px]" style={{ color: 'var(--p1-text)' }} title={s.ultimoError}>Error: {s.ultimoError.replace(/^\S+\s/, '')}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => accion(s, 'enviar')} disabled={!!ocupado} className={CTRL} title="Mandar ahora el informe del período actual">
                        {ocupado === s.id + 'enviar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}ENVIAR AHORA
                      </button>
                      <button type="button" onClick={() => accion(s, 'pausa')} disabled={!!ocupado} className={CTRL}>{s.activa ? <><Pause className="h-3.5 w-3.5" />PAUSAR</> : <><Play className="h-3.5 w-3.5" />REANUDAR</>}</button>
                      <button type="button" onClick={() => { setError(''); setForm({ ...s, destinatarios: s.destinatarios.join(', ') }) }} aria-label="Editar suscripción" className={CTRL}><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => accion(s, 'borrar')} disabled={!!ocupado} aria-label="Borrar suscripción" className={CTRL}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar suscripción' : 'Suscribir por correo'}</DialogTitle>
            <DialogDescription>{nombre}: el servidor genera el PDF del período y lo manda a estas direcciones.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[11px] tracking-widest text-muted-foreground mb-1">FRECUENCIA</div>
                <div role="group" aria-label="Frecuencia" className="inline-flex border border-border">
                  {(['diaria', 'semanal', 'mensual'] as const).map(f => (
                    <button key={f} type="button" aria-pressed={form.frecuencia === f} onClick={() => setForm({ ...form, frecuencia: f })}
                      className={`px-3 min-h-[32px] text-[11px] font-semibold tracking-wider ${form.frecuencia === f ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}>{f.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {form.frecuencia === 'semanal' && (
                  <label className="flex flex-col gap-1 text-[11px] tracking-widest text-muted-foreground">DÍA
                    <select value={form.dia || 1} onChange={e => setForm({ ...form, dia: Number(e.target.value) })} className="border border-border bg-background px-2 min-h-[34px] text-sm text-foreground tracking-normal">
                      {DIAS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1 text-[11px] tracking-widest text-muted-foreground">HORA
                  <input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="border border-border bg-background px-2 min-h-[34px] text-sm font-mono text-foreground tracking-normal" />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[11px] tracking-widest text-muted-foreground">PERÍODO DEL INFORME
                <Select value={form.periodo || 'frecuencia'} onValueChange={v => setForm({ ...form, periodo: v === 'frecuencia' ? null : v })}>
                  <SelectTrigger className="tracking-normal" aria-label="Período del informe"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frecuencia">Según la frecuencia ({DE_FRECUENCIA[form.frecuencia].toLowerCase()})</SelectItem>
                    {Object.entries(PERIODO_SUS).map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <p className="text-xs text-muted-foreground">{cuando(form)} se envía el informe de: {periodoTxt(form).toLowerCase()}.</p>
              <label className="flex flex-col gap-1 text-[11px] tracking-widest text-muted-foreground">DESTINATARIOS
                <textarea value={form.destinatarios} onChange={e => setForm({ ...form, destinatarios: e.target.value })} rows={3} placeholder="correo@empresa.com, otro@empresa.com"
                  className="border border-border bg-background px-2 py-1.5 text-sm text-foreground tracking-normal" />
                <span className="tracking-normal">Separados por coma o espacio; hasta 20.</span>
              </label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activa} onChange={e => setForm({ ...form, activa: e.target.checked })} />Activa</label>
              {error && <div role="alert" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--p1)', boxShadow: 'inset 4px 0 0 var(--p1)', color: 'var(--p1-text)' }}>{error}</div>}
            </div>
          )}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setForm(null)} className={`${CTRL} min-h-[32px] px-3`}>CANCELAR</button>
            <button type="button" onClick={guardar} disabled={ocupado === 'form'}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[32px] text-[11px] font-semibold tracking-wider bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {ocupado === 'form' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}GUARDAR
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
