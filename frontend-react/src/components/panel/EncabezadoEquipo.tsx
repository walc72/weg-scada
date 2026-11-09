import { X } from 'lucide-react'
import { Chip } from '../CampoBase'
import type { Tono } from '../CampoBase'

// Nombre, tipo/modelo y chip de estado ISA-101
export default function EncabezadoEquipo({ titulo, subtitulo, estado, onClose }: {
  titulo: string; subtitulo: string; estado: { tono: Tono; texto: string }; onClose: () => void
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold truncate">{titulo}</div>
        {subtitulo && <div className="text-xs text-muted-foreground">{subtitulo}</div>}
      </div>
      <Chip tono={estado.tono}>{estado.texto}</Chip>
      <button type="button" onClick={onClose} aria-label="Cerrar" autoFocus className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
    </div>
  )
}
