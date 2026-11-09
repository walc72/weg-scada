import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

// Interruptor ON | OFF de dos segmentos (estilo industrial): ON en --st-run, OFF neutro.
// Sigue siendo el Switch de Radix (role="switch", checked/onCheckedChange); los textos son
// decorativos (aria-hidden) y el nombre accesible lo da el Label o aria-label.
const segmento = 'flex w-8 items-center justify-center transition-colors'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'group peer inline-flex h-6 shrink-0 cursor-pointer select-none items-stretch overflow-hidden rounded-sm border border-input bg-background text-[11px] font-semibold uppercase leading-none tracking-wider text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
    ref={ref}
  >
    <span aria-hidden className={cn(segmento, 'group-data-[state=checked]:bg-(--st-run) group-data-[state=checked]:text-(--st-run-fg)')}>ON</span>
    <span aria-hidden className={cn(segmento, 'border-l border-input group-data-[state=unchecked]:bg-muted group-data-[state=unchecked]:text-foreground')}>OFF</span>
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName
