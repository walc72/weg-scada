import { useEffect } from 'react'
import type { ReactNode } from 'react'

// Contenedor lateral derecho: cierra con Esc o tocando el fondo
export default function PanelLateral({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div className="panel-entra fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l shadow-xl overflow-y-auto p-4 flex flex-col gap-5" role="dialog" aria-modal="true" aria-label={titulo}>
        {children}
      </div>
    </>
  )
}
