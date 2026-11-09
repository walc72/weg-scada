import { useMemo } from 'react'
import TrendChart from '../TrendChart'
import { useDrivesStore } from '../../store/drives'
import { useConfigStore } from '../../store/config'
import { useSeriesVentana, type DatosVentana } from '@/lib/useSeriesVentana'
import { mergeByTimestamp } from '@/lib/timeline'
import { aLps, UNIDAD_CAUDAL } from '@/lib/flow'
import { colorMagnitud } from '@/lib/paleta'
import type { GadgetProps } from './GadgetMarco'

type Magnitud = 'potencia' | 'caudal'
type P = { ts: number; v: number }

// Suma por instante de varias series (alineadas por cercanía de timestamp, como Históricos)
const sumar = (series: Record<string, P[]>) =>
  mergeByTimestamp(series).map(r => ({ ts: r.ts, v: Object.values(r.points).reduce((t, p) => t + p.v, 0) }))

// Filas de InfluxDB → series por equipo del campo pedido
function porNombre(filas: DatosVentana['drives'], campo: string, prefijo = '', filtro?: (n: string) => boolean) {
  const out: Record<string, P[]> = {}
  for (const r of filas || []) {
    const v = r[campo]
    if (typeof v !== 'number' || isNaN(v) || (filtro && !filtro(r.name))) continue
    ;(out[prefijo + r.name] ??= []).push({ ts: new Date(r._time).getTime(), v })
  }
  return out
}

// Potencia total de los motores (kW) o caudal total (L/s: caudalímetros + bombas con caudal manual)
export default function Tendencia({ opciones }: GadgetProps<{ magnitud: Magnitud; ventanaH: 1 | 6 | 24 }>) {
  const { magnitud, ventanaH } = opciones
  const influx = useSeriesVentana(ventanaH)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const flowHistory = useDrivesStore(s => s.flowHistory)
  const devices = useConfigStore(s => s.config?.devices)

  const data = useMemo(() => {
    const manuales = new Set((devices ?? []).filter(x => x.caudal?.modo === 'manual').map(x => x.name))
    let series: Record<string, P[]>
    if (influx) {
      series = magnitud === 'potencia' ? porNombre(influx.drives, 'power')
        : { ...porNombre(influx.flows, 'flow', 'F:'), ...porNombre(influx.drives, 'flow', '', n => manuales.has(n)) }
    } else {
      // Sin InfluxDB: buffer en memoria
      const desde = Date.now() - ventanaH * 3600_000
      const de = <T extends { ts: number }>(m: Map<string, T[]>, campo: (p: T) => number | undefined, prefijo = '', filtro?: (n: string) => boolean) =>
        Object.fromEntries([...m].filter(([n]) => !filtro || filtro(n)).map(([n, pts]) =>
          [prefijo + n, pts.flatMap(p => { const v = campo(p); return p.ts >= desde && typeof v === 'number' ? [{ ts: p.ts, v }] : [] })]))
      series = magnitud === 'potencia' ? de(driveHistory, p => p.power)
        : { ...de(flowHistory, p => p.flow, 'F:'), ...de(driveHistory, p => p.flow, '', n => manuales.has(n)) }
    }
    return sumar(series).map(p => ({ ts: p.ts, v: magnitud === 'caudal' ? aLps(p.v) : p.v }))
  }, [influx, magnitud, ventanaH, driveHistory, flowHistory, devices])

  const unit = magnitud === 'potencia' ? 'kW' : UNIDAD_CAUDAL
  const label = magnitud === 'potencia' ? 'Potencia total' : 'Caudal total'
  return (
    <TrendChart title={`TENDENCIA · ${label} (${unit}) · ${ventanaH} H`} data={data} unit={unit} height={220} yDomain={['auto', 'auto']}
      decimals={magnitud === 'caudal' ? 1 : 0} series={[{ key: 'v', label, color: colorMagnitud(magnitud) }]} />
  )
}
