import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Botones de la marca HECIAN LC v0.2.0 (src/marca/hecian-botones.css, clases .hlc-btn) con el texto de la guía
// industrial del portal (docs/diseno-industrial.md): mayúsculas de 12 px, peso 600 y tracking.
// - default (primario): azul profundo en claro, cian con texto negro mate en oscuro. Una por sección o diálogo.
// - outline / secondary: secundario neutro con borde gris medio. ghost / link: terciario, solo texto.
// - destructive y destructiveSolid: texto y borde burdeos, NUNCA relleno (marca, 2026-11-26) y siempre con
//   confirmación (ConfirmarDialog). destructiveSolid queda como nombre por compatibilidad: se ve igual.
// - Nunca colores de estado (rojo, ámbar, amarillo, verde de marcha, azul de sin comunicación) en un botón:
//   son de las alarmas y del proceso (ISA-101).
// - Altos de la marca: 32 px normal, 24 px «sm», 44 px «lg» (táctil); «icon» es cuadrado de 32 px con aria-label.
// - Deshabilitado: contorno punteado y texto gris (lo pone .hlc-btn:disabled).
// - Radio 3 px y foco de 2 px separado 2 px: los da .hlc-btn.
const buttonVariants = cva(
  'hlc-btn text-xs font-semibold uppercase tracking-wider disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'hlc-btn--primario',
        destructive: 'hlc-btn--destructivo',
        destructiveSolid: 'hlc-btn--destructivo',
        outline: 'hlc-btn--secundario',
        secondary: 'hlc-btn--secundario',
        ghost: 'hlc-btn--terciario',
        link: 'hlc-btn--terciario'
      },
      size: {
        default: '',
        sm: 'hlc-btn--compacto',
        lg: 'hlc-btn--tactil',
        icon: 'hlc-btn--icono'
      }
    },
    compoundVariants: [
      // Acciones de ícono en filas y en el encabezado: ícono neutro (el azul del terciario es para texto)
      { variant: 'ghost', size: 'icon', class: 'text-muted-foreground hover:text-foreground hover:no-underline' }
    ],
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { buttonVariants }
