import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Network } from 'lucide-react'
import { ubicar } from '../../lib/unifilar'
import { useUnifilarStore } from '../../store/unifilar'
import { useConfigStore } from '../../store/config'
import { useLicense } from '../../store/license'

let pedido = false  // el archivo se pide una sola vez para todas las tarjetas

// Ícono que abre el unifilar con el equipo centrado y su panel abierto; solo si está dibujado
export default function VerEnUnifilar({ equipo }: { equipo: string }) {
  const data = useUnifilarStore(s => s.data)
  const cargar = useUnifilarStore(s => s.cargar)
  const config = useConfigStore(s => s.config)
  const habilitado = useLicense(s => s.hasModule('unifilar'))
  useEffect(() => { if (habilitado && !data && !pedido) { pedido = true; cargar() } }, [habilitado, data, cargar])
  const donde = habilitado && data && config ? ubicar(data, equipo, config) : null
  if (!donde) return null
  return (
    <Link to={`/unifilar/${donde.dibujo}?equipo=${encodeURIComponent(donde.nodo)}`} onClick={e => e.stopPropagation()}
      title="Ver en el unifilar" aria-label={`Ver ${equipo} en el unifilar`}
      className="inline-flex shrink-0 items-center rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-primary">
      <Network className="h-3.5 w-3.5" />
    </Link>
  )
}
