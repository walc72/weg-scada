import { useBrandingStore } from '../store/branding'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { FirmaHecian } from './FirmaHecian'

// «Acerca de» (marca HECIAN LC v0.2.0, plantillas/ESTANDAR.md): producto, versión y fecha de compilación, firma,
// derechos, «Powered by» del cliente si lo hay y el aviso de componentes de código abierto. Se abre desde el
// botón (i) del encabezado y desde la firma del pie.
export default function AcercaDe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const instalacion = useBrandingStore(s => s.name)
  const footer = useBrandingStore(s => s.footer)
  const anio = __BUILD_DATE__.slice(0, 4)
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Acerca de</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">Producto, versión, derechos y licencias</DialogDescription>
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-titulo text-2xl font-semibold leading-tight">WEG SCADA</div>
            {instalacion && <div className="text-muted-foreground">{instalacion}</div>}
            <div className="mt-1 text-muted-foreground">
              Versión <span className="font-mono text-foreground">{__APP_VERSION__}</span>
              {' · '}compilada el <span className="font-mono text-foreground">{__BUILD_DATE__}</span>
            </div>
          </div>
          <FirmaHecian ancho={160} />
          <p>© {anio} HECIAN LC. Todos los derechos reservados. Software propietario.</p>
          {footer && <p>Powered by <strong className="font-semibold">{footer}</strong></p>}
          <p className="text-xs text-muted-foreground">Este producto usa componentes de código abierto que se rigen por sus propias licencias.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
