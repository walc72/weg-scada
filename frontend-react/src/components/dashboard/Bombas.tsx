import { useMemo } from 'react'
import { useConfigStore } from '../../store/config'
import MotorStrip from '../MotorStrip'
import { useTarjetas } from '@/lib/useTarjetas'
import { agruparPorSitio } from '@/lib/sitios'
import { useDatosDashboard, type GadgetProps } from './GadgetMarco'

// Línea de bombeo agrupada por sitio; `sitios` null = todos
export default function Bombas({ opciones }: GadgetProps<{ sitios: string[] | null }>) {
  const { driveList } = useDatosDashboard()
  const config = useConfigStore(s => s.config)
  const { sitios } = opciones
  const grupos = useMemo(() => agruparPorSitio(driveList, config?.devices ?? []).filter(g => !sitios || (g.sitio !== null && sitios.includes(g.sitio))),
    [driveList, config?.devices, sitios])
  const tarjetas = useTarjetas(driveList)
  if (grupos.length === 0) return null
  return <MotorStrip grupos={grupos} gaugeZones={config?.gaugeZones ?? {}} tarjetas={tarjetas} />
}
