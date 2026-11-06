import { useNavigate } from 'react-router'
import { useDrivesStore } from '../store/drives'
import { useConfigStore } from '../store/config'
import { SkeletonVista } from '../components/ui/skeleton'
import GenCard from '../components/GenCard'

// Generadores: una tarjeta por grupo electrógeno habilitado; clic → detalle (/generadores/:name)
export default function Generadores() {
  const config = useConfigStore(s => s.config)
  const campo = useDrivesStore(s => s.campo)
  const navigate = useNavigate()
  if (!config) return <SkeletonVista />
  const gens = (config.generadores ?? []).filter(c => c.enabled !== false)
  if (gens.length === 0) return <div className="text-center text-muted-foreground text-sm py-16">No hay generadores configurados.</div>
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {gens.map(c => (
        <GenCard key={c.name} cfg={c} st={campo.get(c.name)} onOpen={() => navigate(`/generadores/${encodeURIComponent(c.name)}`)} />
      ))}
    </div>
  )
}
