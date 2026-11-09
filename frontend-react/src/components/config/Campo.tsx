import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

export function Campo({ etiqueta, ayuda, htmlFor, children }: {
  etiqueta: string; ayuda?: string; htmlFor?: string; children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{etiqueta}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  )
}
