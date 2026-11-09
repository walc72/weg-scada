import * as React from 'react'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'

export interface ConfirmarDialogProps {
  open: boolean
  titulo: string
  mensaje: React.ReactNode
  textoConfirmar?: string
  peligro?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

// Confirmación del portal (reemplaza a confirm() del navegador). Cerrar con Esc o la X = cancelar.
export function ConfirmarDialog({ open, titulo, mensaje, textoConfirmar = 'Confirmar', peligro = false, onConfirmar, onCancelar }: ConfirmarDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancelar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <DialogDescription asChild>
          <div>{mensaje}</div>
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button variant={peligro ? 'destructiveSolid' : 'default'} onClick={onConfirmar}>{textoConfirmar}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
