import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { CATALOGO, type TipoGadget } from '@/lib/gadgets'

// «AGREGAR GADGET»: lo elegido va al final con su ancho por defecto
export default function CatalogoDialog({ open, disponibles, onAgregar, onCerrar }: {
  open: boolean; disponibles: { tipo: TipoGadget; deshabilitado: boolean }[]
  onAgregar: (tipo: TipoGadget) => void; onCerrar: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar gadget</DialogTitle>
          <DialogDescription>Los que ya están en el Dashboard y no se pueden repetir aparecen deshabilitados; Mis gráficos necesita al menos un gráfico armado.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {disponibles.map(d => (
            <Button key={d.tipo} variant="outline" className="justify-between" disabled={d.deshabilitado} onClick={() => onAgregar(d.tipo)}>
              {CATALOGO[d.tipo].titulo}
              {d.deshabilitado && <span className="text-muted-foreground">{d.tipo === 'misGrafico' ? 'SIN GRÁFICOS' : 'YA ESTÁ'}</span>}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>CANCELAR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
