import { Link } from 'react-router-dom'
import { Radio } from 'lucide-react'

// Reemplaza al «OFFLINE» cuando el equipo no responde porque el enlace de radio que lo une está caído
export function SinEnlaceBadge({ name }: { name: string }) {
  return (
    <Link
      to="/comunicaciones"
      className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-500/25"
    >
      <Radio className="h-3 w-3" /> Sin enlace · {name}
    </Link>
  )
}
