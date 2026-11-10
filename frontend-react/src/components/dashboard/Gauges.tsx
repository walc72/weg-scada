import { useDrivesStore } from '../../store/drives'
import { useConfigStore } from '../../store/config'
import { useNow } from '@/lib/useNow'
import { lectura, zonaDe, type Gauge } from '@/lib/gauges'
import { varDe } from '@/lib/misGraficos'
import { useEquipos } from '../GraficoUsuario'
import ArcGauge from '../ArcGauge'
import type { GadgetProps } from './GadgetMarco'

// Varios gauges de arco, cada uno con su equipo y variable (elegidos en ⚙ opciones)
export default function Gauges({ opciones }: GadgetProps<{ gauges: Gauge[] }>) {
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const campo = useDrivesStore(s => s.campo)
  const config = useConfigStore(s => s.config)
  const equipos = useEquipos()
  const ahora = useNow()
  if (opciones.gauges.length === 0) return <p className="text-sm text-muted-foreground">Sin variables. Elegilas en PERSONALIZAR → ⚙.</p>
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      {opciones.gauges.map((g, i) => {
        const l = lectura(g, { drives, meters, campo }, ahora)
        const v = varDe(g)
        return <ArcGauge key={i} valor={l.valor} stale={l.stale} label={v?.label ?? g.field} unit={v?.unit ?? ''}
          equipo={equipos[g.src].find(e => e.name === g.name)?.label ?? g.name} zona={zonaDe(g, config, drives)} />
      })}
    </div>
  )
}
