import { useEffect, useState } from 'react'
import { Gauge, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '../store/auth'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API = `${(import.meta.env.VITE_API_BASE as string) || '/api'}/reports/informes/demanda`
const CTRL = 'inline-flex items-center gap-1 border border-border bg-background px-2 min-h-[28px] text-[11px] font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40'
const NINGUNO = '__ninguno__'

interface Sec { dibujo: string; nodo: string; nombre: string; dibujoNombre?: string; cerrado: boolean }
interface Cambio { id: string; fecha: string; cerrado: boolean; usuario: string; origen: 'maniobra' | 'editor' | 'manual' }
interface Config { medidores: string[]; seccionador: { dibujo: string; nodo: string } | null }
interface Vista { config: Config; medidores: { name: string; nombre: string }[]; seccionadores: Sec[]; cambios: Cambio[] }

const DEMO: Vista = {
  config: { medidores: ['PM8000', 'PM8000 #2'], seccionador: { dibujo: 'general', nodo: 's1' } },
  medidores: [{ name: 'PM8000', nombre: 'BRO7 línea exclusiva' }, { name: 'PM8000 #2', nombre: 'Agrocaraya' }, { name: 'PM8000 #3', nombre: 'Agriplus' }],
  seccionadores: [{ dibujo: 'general', nodo: 's1', nombre: 'Enlace Pública', cerrado: false }],
  cambios: [
    { id: 'm1', fecha: '2026-10-03T08:00:00.000Z', cerrado: true, usuario: 'admin', origen: 'manual' },
    { id: 'm2', fecha: '2026-10-15T17:30:00.000Z', cerrado: false, usuario: 'admin', origen: 'manual' },
  ],
}
const ORIGEN = { maniobra: 'Maniobra en el unifilar', editor: 'Editor del unifilar', manual: 'Cargado a mano' }
const fFecha = (v: string) => new Date(v).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const clave = (s: { dibujo: string; nodo: string } | null) => (s ? `${s.dibujo}|${s.nodo}` : NINGUNO)

async function api(url: string, method = 'GET', body?: unknown) {
  const r = await authFetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
  return j
}

// Medidores del bloque Demanda (solo administradores): uno o dos y, con dos, el seccionador de enlace.
// Con el seccionador cerrado el segundo medidor queda aguas abajo del primero y el total es solo el primero.
// Las maniobras quedan registradas con fecha; los períodos anteriores se cargan a mano.
export default function DemandaConfig() {
  const [v, setV] = useState<Vista | null>(null)
  const [form, setForm] = useState<Config>({ medidores: [], seccionador: null })
  const [periodo, setPeriodo] = useState({ desde: '', hasta: '', cerrado: true })
  const [ocupado, setOcupado] = useState<string | null>(null)

  const recargar = () => (MODE === 'mock' ? Promise.resolve(DEMO) : api(API)).then((x: Vista) => { setV(x); setForm(x.config) }).catch(e => toast.error(`Demanda: ${e.message}`))
  useEffect(() => { recargar() }, [])
  if (!v) return null

  const [a = NINGUNO, b = NINGUNO] = form.medidores
  const setMed = (i: 0 | 1, val: string) => {
    const l = [a, b]; l[i] = val
    const medidores = l.filter(x => x !== NINGUNO)
    setForm({ medidores: [...new Set(medidores)], seccionador: medidores.length === 2 ? form.seccionador : null })
  }
  const guardada = v.config.seccionador && v.seccionadores.find(s => clave(s) === clave(v.config.seccionador))
  const cambiado = JSON.stringify(form) !== JSON.stringify(v.config)
  const nombre = (n: string) => v.medidores.find(m => m.name === n)?.nombre ?? n

  async function guardar() {
    setOcupado('guardar')
    try {
      if (MODE === 'mock') setV({ ...v!, config: form })
      else { await api(API, 'PUT', form); await recargar() }
      toast.success('Medidores de demanda guardados')
    } catch (e: any) { toast.error(e.message) } finally { setOcupado(null) }
  }
  async function agregar() {
    if (!guardada || !periodo.desde) return
    setOcupado('agregar')
    try {
      const body = { dibujo: guardada.dibujo, nodo: guardada.nodo, cerrado: periodo.cerrado, desde: new Date(periodo.desde).toISOString(), hasta: periodo.hasta ? new Date(periodo.hasta).toISOString() : null }
      if (MODE === 'mock') {
        const n: Cambio[] = [{ id: `d${Date.now()}`, fecha: body.desde, cerrado: body.cerrado, usuario: 'demo', origen: 'manual' },
          ...(body.hasta ? [{ id: `h${Date.now()}`, fecha: body.hasta, cerrado: !body.cerrado, usuario: 'demo', origen: 'manual' as const }] : [])]
        setV({ ...v!, cambios: [...v!.cambios, ...n].sort((x, y) => x.fecha.localeCompare(y.fecha)) })
      } else { await api(`${API}/cambios`, 'POST', body); await recargar() }
      setPeriodo({ desde: '', hasta: '', cerrado: true })
      toast.success('Período agregado')
    } catch (e: any) { toast.error(e.message) } finally { setOcupado(null) }
  }
  async function borrar(c: Cambio) {
    if (!window.confirm(`¿Borrar el cambio del ${fFecha(c.fecha)} (${c.cerrado ? 'cerrado' : 'abierto'})?`)) return
    setOcupado(c.id)
    try {
      if (MODE === 'mock') setV({ ...v!, cambios: v!.cambios.filter(x => x.id !== c.id) })
      else { await api(`${API}/cambios/${c.id}`, 'DELETE'); await recargar() }
    } catch (e: any) { toast.error(e.message) } finally { setOcupado(null) }
  }

  const resumen = v.config.medidores.length === 0 ? 'automático: el medidor principal'
    : v.config.medidores.length === 1 ? nombre(v.config.medidores[0])
    : `${nombre(v.config.medidores[0])} + ${nombre(v.config.medidores[1])} y total${guardada ? ` (seccionador ${guardada.nombre})` : ''}`
  const etiqueta = 'flex flex-col gap-1 text-[11px] tracking-widest text-muted-foreground'

  return (
    <section aria-label="Medidores de demanda" className="bg-card border">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 border-b">
        <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-bold tracking-widest uppercase">Medidores de demanda</h3>
        <span className="text-[11px] text-muted-foreground">{resumen}</span>
      </header>
      <div className="p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className={etiqueta}>MEDIDOR A
            <Select value={a} onValueChange={x => setMed(0, x)}>
              <SelectTrigger className="tracking-normal min-w-[220px]" aria-label="Medidor A"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNO}>Automático (principal)</SelectItem>
                {v.medidores.map(m => <SelectItem key={m.name} value={m.name}>{m.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className={etiqueta}>MEDIDOR B
            <Select value={b} onValueChange={x => setMed(1, x)} disabled={a === NINGUNO}>
              <SelectTrigger className="tracking-normal min-w-[220px]" aria-label="Medidor B"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNO}>Ninguno</SelectItem>
                {v.medidores.filter(m => m.name !== a).map(m => <SelectItem key={m.name} value={m.name}>{m.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          {form.medidores.length === 2 && (
            <label className={etiqueta}>SECCIONADOR DE ENLACE
              <Select value={clave(form.seccionador)} onValueChange={x => { const s = v.seccionadores.find(y => clave(y) === x); setForm({ ...form, seccionador: s ? { dibujo: s.dibujo, nodo: s.nodo } : null }) }}>
                <SelectTrigger className="tracking-normal min-w-[240px]" aria-label="Seccionador de enlace"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>Sin seccionador (siempre A + B)</SelectItem>
                  {v.seccionadores.map(s => <SelectItem key={clave(s)} value={clave(s)}>{s.nombre}{s.dibujoNombre ? ` · ${s.dibujoNombre}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          )}
          <button type="button" onClick={guardar} disabled={!cambiado || !!ocupado} className={CTRL}>
            {ocupado === 'guardar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}GUARDAR
          </button>
        </div>
        {form.medidores.length === 2 && (
          <p className="text-xs text-muted-foreground">
            El total es la demanda coincidente: la suma de A y B en cada bloque de 15 min. Con el seccionador cerrado, B queda aguas abajo de A y el total es solo A.
            {' '}La energía total de Indicadores, Comparativo y Por día es A + B, sin B mientras el seccionador está cerrado.
            {' '}Si A es el principal del balance de pérdida y B uno de los que restan, B se resta solo con el seccionador cerrado.
          </p>
        )}

        {guardada && !cambiado && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-[11px] font-bold tracking-widest uppercase">Maniobras de {guardada.nombre}</h4>
              <span className="text-[11px] text-muted-foreground">ahora {guardada.cerrado ? 'cerrado' : 'abierto'} · se registran solas al maniobrar en el unifilar; los períodos anteriores se cargan a mano</span>
            </div>
            {v.cambios.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[13px]">
                  <thead>
                    <tr className="text-[11px] tracking-wider text-muted-foreground">
                      {['FECHA', 'QUEDÓ', 'ORIGEN', 'USUARIO', ''].map(h => <th key={h} scope="col" className="text-left font-medium px-3 py-1.5 border-b">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...v.cambios].reverse().map(c => (
                      <tr key={c.id} className="border-b border-border/60">
                        <td className="px-3 py-1.5 font-mono tabular-nums whitespace-nowrap">{fFecha(c.fecha)}</td>
                        <td className="px-3 py-1.5 font-semibold">{c.cerrado ? 'CERRADO (B aguas abajo)' : 'ABIERTO (A + B)'}</td>
                        <td className="px-3 py-1.5">{ORIGEN[c.origen] ?? c.origen}</td>
                        <td className="px-3 py-1.5">{c.usuario || '—'}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button type="button" onClick={() => borrar(c)} disabled={!!ocupado} aria-label={`Borrar el cambio del ${fFecha(c.fecha)}`} className={CTRL}><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin maniobras registradas: se toma el estado actual del seccionador para todo el período.</p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div role="group" aria-label="Estado en el período" className="inline-flex border border-border">
                {([true, false] as const).map(c => (
                  <button key={String(c)} type="button" aria-pressed={periodo.cerrado === c} onClick={() => setPeriodo({ ...periodo, cerrado: c })}
                    className={`px-3 min-h-[32px] text-[11px] font-semibold tracking-wider ${periodo.cerrado === c ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}>{c ? 'CERRADO' : 'ABIERTO'}</button>
                ))}
              </div>
              <label className={etiqueta}>DESDE
                <input type="datetime-local" value={periodo.desde} onChange={e => setPeriodo({ ...periodo, desde: e.target.value })} className="border border-border bg-background px-2 min-h-[32px] text-xs font-mono text-foreground tracking-normal" />
              </label>
              <label className={etiqueta}>HASTA (OPCIONAL)
                <input type="datetime-local" value={periodo.hasta} min={periodo.desde} onChange={e => setPeriodo({ ...periodo, hasta: e.target.value })} className="border border-border bg-background px-2 min-h-[32px] text-xs font-mono text-foreground tracking-normal" />
              </label>
              <button type="button" onClick={agregar} disabled={!periodo.desde || !!ocupado} className={CTRL}>
                {ocupado === 'agregar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}AGREGAR PERÍODO
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
