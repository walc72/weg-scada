import { cn } from '@/lib/utils'

// Bloques grises que ocupan el lugar del contenido mientras carga (sin animación si el
// sistema pide movimiento reducido). El contenedor anuncia «Cargando» a lectores de pantalla.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('motion-safe:animate-pulse bg-muted', className)} />
}

function Cargando({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div role="status" aria-label="Cargando" className={className}>{children}</div>
}

// Filas de una tabla o lista
export function SkeletonTabla({ filas = 5, className }: { filas?: number; className?: string }) {
  return (
    <Cargando className={cn('flex flex-col gap-2 py-2', className)}>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: filas }, (_, i) => <Skeleton key={i} className="h-9 w-full opacity-70" />)}
    </Cargando>
  )
}

// Vista completa: barra de título, fila de indicadores y tarjetas
export function SkeletonVista({ tarjetas = 6 }: { tarjetas?: number }) {
  return (
    <Cargando className="flex flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {Array.from({ length: tarjetas }, (_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    </Cargando>
  )
}

// Bloque suelto (gráfico, línea de tiempo)
export function SkeletonBloque({ className }: { className?: string }) {
  return <Cargando><Skeleton className={cn('h-24 w-full', className)} /></Cargando>
}
