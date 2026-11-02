import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { useUnifilarStore } from '../../store/unifilar'
import { apiJson } from '../../lib/api'
import { conManiobra } from '../../lib/unifilar'
import type { Nodo } from '../../lib/unifilar'

// Cambia la posición de un seccionador en el dibujo (abierto ↔ cerrado). Es solo visual: no maniobra
// el equipo, cambia cómo se dibuja la energización (p. ej. qué fuente alimenta a un sitio).
// La hace cualquier usuario de planta (también operador) con POST /unifilar/maniobra, que cambia solo
// esa posición y la deja en el historial con el usuario.
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

export default function Maniobra({ nodo, dibujo, nombre, onClose }: { nodo: Nodo; dibujo: string; nombre: string; onClose: () => void }) {
  const { data, guardar, refrescar } = useUnifilarStore()
  const [guardando, setGuardando] = useState(false)
  const nuevo = nodo.cerrado ? 'ABIERTO' : 'CERRADO'

  async function confirmar() {
    if (!data) return
    setGuardando(true)
    try {
      if (MODE === 'mock') await guardar(conManiobra(data, dibujo, nodo.id))
      else { await apiJson('/unifilar/maniobra', { method: 'POST', body: JSON.stringify({ dibujo, nodo: nodo.id }) }); await refrescar() }
      toast.success(`${nombre}: ${nuevo.toLowerCase()}`)
      onClose()
    } catch (e: any) {
      toast.error(`No se pudo cambiar: ${e.message}`)
      refrescar().catch(() => {})
    } finally { setGuardando(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{nombre}</DialogTitle>
          <DialogDescription>
            Ahora está <strong>{nodo.cerrado ? 'cerrado' : 'abierto'}</strong>. ¿Marcarlo como <strong>{nuevo.toLowerCase()}</strong>?
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Es solo para la visualización: cambia qué tramos se dibujan con tensión, no maniobra el equipo. Lo ven todos y queda en el historial del unifilar.
        </p>
        <DialogFooter className="gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center border border-border bg-background px-3 min-h-[32px] text-[11px] font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent">CANCELAR</button>
          <button type="button" onClick={confirmar} disabled={guardando}
            className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[32px] text-[11px] font-semibold tracking-wider bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}MARCAR {nuevo}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
