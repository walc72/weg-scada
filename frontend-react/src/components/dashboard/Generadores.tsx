import { useNavigate } from 'react-router'
import { useDrivesStore } from '../../store/drives'
import { useConfigStore } from '../../store/config'
import GenCard from '../GenCard'
import type { GadgetProps } from './GadgetMarco'

// Las mismas tarjetas que la pestaña Generadores de Equipos; clic → detalle
export default function Generadores(_: GadgetProps<Record<string, never>>) {
  const gens = useConfigStore(s => s.config?.generadores)
  const campo = useDrivesStore(s => s.campo)
  const navigate = useNavigate()
  const lista = (gens ?? []).filter(c => c.enabled !== false)
  if (lista.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay generadores.</p>
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {lista.map(c => <GenCard key={c.name} cfg={c} st={campo.get(c.name)} onOpen={() => navigate(`/generadores/${encodeURIComponent(c.name)}`)} />)}
    </div>
  )
}
