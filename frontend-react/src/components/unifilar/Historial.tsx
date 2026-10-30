import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { pedirHistorial, pedirVersion } from '../../store/unifilar'
import type { EntradaHistorial } from '../../store/unifilar'
import type { Unifilar } from '../../lib/unifilar'

const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

// Guardados anteriores: «Ver» carga esa versión en el editor como cambio sin guardar
export default function Historial({ vigente, onVer, onCerrar }: { vigente: string | null; onVer: (u: Unifilar) => void; onCerrar: () => void }) {
  const [lista, setLista] = useState<EntradaHistorial[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState<string | null>(null)
  useEffect(() => { pedirHistorial().then(setLista).catch(e => setError((e as Error).message)) }, [])
  const ver = async (id: string) => {
    setCargando(id)
    try { onVer((await pedirVersion(id)).data) } catch (e) { setError((e as Error).message) } finally { setCargando(null) }
  }
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onCerrar} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-l bg-background p-4 shadow-xl" role="dialog" aria-label="Historial">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-bold">Historial de guardados</div>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">«Ver» abre esa versión en el editor sin guardarla. Para recuperarla tocá Guardar; para volver, Descartar.</p>
        {error && <div className="mb-2 text-sm text-destructive">{error}</div>}
        {!lista && !error && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando...</div>}
        {lista?.length === 0 && <div className="text-sm text-muted-foreground">Todavía no hay guardados en el historial.</div>}
        <ul className="flex flex-col gap-1">
          {lista?.map(h => (
            <li key={h.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium tabular-nums">{fecha(h.fecha)} · {h.usuario || '—'}</div>
                <div className="text-xs text-muted-foreground">{h.elementos} elementos{h.version === vigente && ' · vigente'}</div>
              </div>
              <button type="button" disabled={h.version === vigente || cargando != null} onClick={() => ver(h.id)}
                className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-40">
                {cargando === h.id && <Loader2 className="h-3 w-3 animate-spin" />}Ver
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
