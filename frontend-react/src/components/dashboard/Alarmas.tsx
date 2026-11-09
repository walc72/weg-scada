import AlarmBanner from '../AlarmBanner'
import { useDatosDashboard, type GadgetProps } from './GadgetMarco'

// Condición más grave en curso; sin alarmas no ocupa lugar (la celda se oculta con `empty:hidden`)
export default function Alarmas(_: GadgetProps<Record<string, never>>) {
  const { driveList } = useDatosDashboard()
  return <AlarmBanner drives={driveList} />
}
