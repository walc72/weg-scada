import { Button } from '@/components/ui/button'

export function BarraGuardado({ sucio, guardando, onDescartar, onGuardar }: {
  sucio: boolean; guardando?: boolean; onDescartar: () => void; onGuardar: () => void
}) {
  if (!sucio) return null
  return (
    <div className="flex items-center justify-end gap-2 border-t pt-3">
      <span className="mr-auto text-[11px] font-semibold tracking-wider text-(--p3-text)">CAMBIOS SIN GUARDAR</span>
      <Button variant="outline" size="sm" onClick={onDescartar} disabled={guardando}>DESCARTAR</Button>
      <Button size="sm" onClick={onGuardar} disabled={guardando}>GUARDAR</Button>
    </div>
  )
}
