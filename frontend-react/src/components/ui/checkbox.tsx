import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

// Casilla cuadrada de 16 px y esquina 2 px (estilo industrial), accesible como role="checkbox".
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={e => { onClick?.(e); if (!e.defaultPrevented) onCheckedChange?.(!checked) }}
      className={cn(
        'peer inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className
      )}
      {...props}
    >
      {checked && <Check aria-hidden className="h-3 w-3" strokeWidth={3} />}
    </button>
  )
)
Checkbox.displayName = 'Checkbox'
