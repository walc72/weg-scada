import { cn } from '@/lib/utils'
import isotipoPositivo from '../marca/isotipo-positivo.svg'
import isotipoNegativo from '../marca/isotipo-negativo.svg'
import firmaClara from '../marca/firma-claro.svg'
import firmaOscura from '../marca/firma-oscuro.svg'

// Firma HECIAN LC en la app (marca v0.2.0, plantillas/ESTANDAR.md). Siempre con los SVG en curvas de la marca:
// nunca se escribe «HECIAN LC» con una fuente en lugar del logo. Cada pieza va en dos versiones y el tema elige
// por la clase .dark del <html>.

// Isotipo cuadrado: el SVG trae su margen de protección (25 de 150), así que la caja de 24 px deja la marca en 16 px.
export function IsotipoHecian({ className }: { className?: string }) {
  return <>
    <img src={isotipoPositivo} alt="" aria-hidden="true" className={cn('h-6 w-6 shrink-0 dark:hidden', className)} />
    <img src={isotipoNegativo} alt="" aria-hidden="true" className={cn('hidden h-6 w-6 shrink-0 dark:block', className)} />
  </>
}

// Pie y barra de estado: isotipo de 16 px + «Desarrollado por HECIAN LC», 12 px, texto secundario.
export function FirmaPie({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs text-muted-foreground', className)}>
      <IsotipoHecian className="-my-1" />Desarrollado por HECIAN LC
    </span>
  )
}

// Firma completa (isotipo y logotipo), 140 px de ancho como mínimo (tamaño mínimo del manual).
export function FirmaHecian({ ancho = 140, className }: { ancho?: number; className?: string }) {
  const estilo = { width: Math.max(140, ancho) }
  return <>
    <img src={firmaClara} alt="HECIAN LC" style={estilo} className={cn('h-auto dark:hidden', className)} />
    <img src={firmaOscura} alt="HECIAN LC" style={estilo} className={cn('hidden h-auto dark:block', className)} />
  </>
}

// Login: «Desarrollado por» + la firma, debajo del formulario.
export function FirmaIngreso({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span>Desarrollado por</span>
      <FirmaHecian />
    </div>
  )
}
