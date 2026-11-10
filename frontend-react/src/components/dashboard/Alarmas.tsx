import AlarmBanner from '../AlarmBanner'
import { useDatosDashboard, type GadgetProps } from './GadgetMarco'

// Condición más grave en curso; sin alarmas no ocupa lugar (la celda se oculta con `empty:hidden`).
// En edición hace falta algo visible para moverlo: el aviso se muestra solo si el banner no dibujó nada (`only:`).
export default function Alarmas({ editando }: GadgetProps<Record<string, never>>) {
  const { driveList } = useDatosDashboard()
  if (!editando) return <AlarmBanner drives={driveList} />
  return (
    <div>
      <AlarmBanner drives={driveList} />
      <p className="hidden only:block rounded-sm border px-4 py-2 text-sm text-muted-foreground">Sin alarmas activas.</p>
    </div>
  )
}
