import { useState } from 'react'
import { X } from 'lucide-react'

// Avisos de licencia (pruebas de módulos, vencimiento cercano) en una tarjeta fija al costado
// derecho. Se cierra por la sesión; vuelve si cambia el texto (p. ej. al día siguiente).
const CLAVE = 'weg_avisos_licencia'

export default function AvisosLicencia({ avisos }: { avisos: string[] }) {
  const texto = avisos.join('|')
  const [cerrado, setCerrado] = useState(() => { try { return sessionStorage.getItem(CLAVE) === texto } catch { return false } })
  if (!avisos.length || cerrado) return null
  const cerrar = () => { try { sessionStorage.setItem(CLAVE, texto) } catch { /* sin storage: solo esta vista */ } setCerrado(true) }
  return (
    <div role="status" className="fixed right-4 bottom-4 z-30 w-80 max-w-[calc(100vw-2rem)] border bg-card shadow-lg text-xs" style={{ borderColor: 'var(--p2)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b font-semibold tracking-wide">
        <span>LICENCIA</span>
        <button type="button" onClick={cerrar} aria-label="Cerrar avisos de licencia" className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="px-3 py-2 space-y-1.5">
        {avisos.map(a => <li key={a}>{a}</li>)}
      </ul>
    </div>
  )
}
