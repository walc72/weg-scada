import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function SeccionConfig({ titulo, ayuda, acciones, children, className }: {
  titulo: string; ayuda?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <Card className={cn('p-4 space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-widest uppercase">{titulo}</h2>
        {acciones && <div className="flex items-center gap-2">{acciones}</div>}
      </div>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      {children}
    </Card>
  )
}
