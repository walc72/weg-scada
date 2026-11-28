import { Link } from 'react-router'
import { Radio } from 'lucide-react'
import { SimboloEstado } from './SimboloEstado'

// Reemplaza al «SIN COMUNICACIÓN» cuando el equipo no responde porque el enlace de radio que lo une está caído:
// mismo símbolo violeta «?» de sin comunicación, con el ícono de radio y el nombre del enlace
export function SinEnlaceBadge({ name }: { name: string }) {
  return (
    <Link
      to="/comunicaciones"
      className="hlc-estado inline-flex items-center gap-1 border border-border px-3 py-1 text-xs font-bold text-foreground hover:bg-muted"
    >
      <SimboloEstado prioridad="invalido" /><Radio className="h-3 w-3" /> Sin enlace · {name}
    </Link>
  )
}
