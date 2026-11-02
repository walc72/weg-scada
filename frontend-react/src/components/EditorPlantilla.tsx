import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, X, Plus, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'

export interface PlantillaForm { id?: string; nombre: string; periodo: string; bloques: string[] }

export const PERIODO_TXT: Record<string, string> = { hoy: 'Hoy', ayer: 'Ayer', '7d': 'Últimos 7 días', mes: 'Mes en curso', mes_anterior: 'Mes anterior' }
const CTRL = 'inline-flex items-center gap-1 border border-border bg-background px-2 min-h-[28px] text-[11px] font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40'

// Ventana para crear o editar una plantilla propia: nombre, período sugerido y
// bloques en orden (se agregan de la lista de abajo, se ordenan con ▲▼, se sacan con ✕)
export default function EditorPlantilla({ inicial, catalogo, onGuardar, onCerrar }: {
  inicial: PlantillaForm | null; catalogo: Record<string, string>
  onGuardar: (p: PlantillaForm) => Promise<void>; onCerrar: () => void
}) {
  const [f, setF] = useState<PlantillaForm>({ nombre: '', periodo: 'mes', bloques: [] })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (inicial) { setF(inicial); setError('') } }, [inicial])

  const mover = (i: number, d: number) => setF(x => { const b = [...x.bloques]; [b[i], b[i + d]] = [b[i + d], b[i]]; return { ...x, bloques: b } })
  const sacar = (i: number) => setF(x => ({ ...x, bloques: x.bloques.filter((_, k) => k !== i) }))
  const agregar = (k: string) => setF(x => ({ ...x, bloques: [...x.bloques, k] }))
  const libres = Object.keys(catalogo).filter(k => !f.bloques.includes(k))

  async function guardar() {
    if (!f.nombre.trim()) { setError('Poné un nombre'); return }
    if (!f.bloques.length) { setError('Elegí al menos un bloque'); return }
    setGuardando(true); setError('')
    try { await onGuardar({ ...f, nombre: f.nombre.trim() }) } catch (e: any) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <Dialog open={!!inicial} onOpenChange={(o) => { if (!o) onCerrar() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{f.id ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          <DialogDescription>Elegí qué bloques lleva el informe y en qué orden. Se guarda en este servidor.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1 text-[11px] tracking-widest text-muted-foreground">NOMBRE
            <input value={f.nombre} maxLength={60} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Informe mensual para el cliente"
              className="border border-border bg-background px-2 min-h-[34px] text-sm text-foreground tracking-normal" autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-[11px] tracking-widest text-muted-foreground">PERÍODO SUGERIDO
            <select value={f.periodo} onChange={e => setF({ ...f, periodo: e.target.value })} className="border border-border bg-background px-2 min-h-[34px] text-sm text-foreground tracking-normal">
              {Object.entries(PERIODO_TXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="text-[11px] tracking-widest text-muted-foreground mb-1.5">BLOQUES DEL INFORME (EN ORDEN)</div>
          {f.bloques.length === 0
            ? <div className="border border-dashed px-3 py-3 text-sm text-muted-foreground">Todavía no hay bloques: agregalos de la lista de abajo.</div>
            : (
              <ol className="border divide-y">
                {f.bloques.map((b, i) => (
                  <li key={b} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <span className="font-mono text-[11px] text-muted-foreground w-5 text-right">{i + 1}</span>
                    <span className="flex-1">{catalogo[b] || b}</span>
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${catalogo[b]}`} className={CTRL}><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === f.bloques.length - 1} aria-label={`Bajar ${catalogo[b]}`} className={CTRL}><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => sacar(i)} aria-label={`Sacar ${catalogo[b]}`} className={CTRL}><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ol>
            )}
          {libres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {libres.map(k => <button key={k} type="button" onClick={() => agregar(k)} className={CTRL}><Plus className="h-3 w-3" />{catalogo[k]}</button>)}
            </div>
          )}
        </div>

        {error && <div role="alert" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--p1)', boxShadow: 'inset 4px 0 0 var(--p1)', color: 'var(--p1-text)' }}>{error}</div>}

        <DialogFooter className="gap-2">
          <button type="button" onClick={onCerrar} className={`${CTRL} min-h-[32px] px-3`}>CANCELAR</button>
          <button type="button" onClick={guardar} disabled={guardando}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[32px] text-[11px] font-semibold tracking-wider bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}GUARDAR
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
