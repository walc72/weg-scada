import { useMemo } from 'react'
import TrendChart from '../TrendChart'
import { useDrivesStore } from '../../store/drives'
import { useConfigStore } from '../../store/config'
import { useSeriesVentana, type DatosVentana } from '@/lib/useSeriesVentana'
import { sumarRetenido, type P } from '@/lib/sumarSeries'
import { aLps, UNIDAD_CAUDAL } from '@/lib/flow'
import { colorMagnitud } from '@/lib/paleta'
import type { GadgetProps } from './GadgetMarco'

type Magnitud = 'potencia' | 'caudal'
type Series = Record<string, P[]>

// Filas de InfluxDB → series por equipo del campo pedido
function deFilas(filas: DatosVentana['drives'], campo: string, prefijo = '', filtro?: (n: string) => boolean): Series {
  const out: Series = {}
  for (const r of filas || []) {
    const v = r[campo]
    if (typeof v !== 'number' || isNaN(v) || (filtro && !filtro(r.name))) continue
    ;(out[prefijo + r.name] ??= []).push({ ts: new Date(r._time).getTime(), v })
  }
  return out
}

// Buffer en memoria → series por equipo del campo pedido, desde `desde`
function deBuffer<T extends { ts: number }>(m: Map<string, T[]>, campo: (p: T) => number | undefined, desde: number, prefijo = '', filtro?: (n: string) => boolean): Series {
  return Object.fromEntries([...m].filter(([n]) => !filtro || filtro(n)).map(([n, pts]) =>
    [prefijo + n, pts.flatMap(p => { const v = campo(p); return p.ts >= desde && typeof v === 'number' ? [{ ts: p.ts, v }] : [] })]))
}

// Potencia total de los motores (kW) o caudal total (L/s: caudalímetros + bombas con caudal manual)
export default function Tendencia({ opciones }: GadgetProps<{ magnitud: Magnitud; ventanaH: 1 | 6 | 24 }>) {
  const { magnitud, ventanaH } = opciones
  const influx = useSeriesVentana(ventanaH)
  const driveHistory = useDrivesStore(s => s.driveHistory)
  const flowHistory = useDrivesStore(s => s.flowHistory)
  const devices = useConfigStore(s => s.config?.devices)
  const manuales = useMemo(() => new Set((devices ?? []).filter(x => x.caudal?.modo === 'manual').map(x => x.name)), [devices])

  const deInflux = useMemo(() => influx && (magnitud === 'potencia' ? deFilas(influx.drives, 'power')
    : { ...deFilas(influx.flows, 'flow', 'F:'), ...deFilas(influx.drives, 'flow', '', n => manuales.has(n)) }), [influx, magnitud, manuales])
  // Sin InfluxDB: buffer en memoria (con datos de Influx no se recalcula con cada dato en vivo)
  const bufDrives = deInflux ? null : driveHistory
  const bufFlows = deInflux ? null : flowHistory
  const deMemoria = useMemo(() => {
    if (!bufDrives || !bufFlows) return null
    const desde = Date.now() - ventanaH * 3600_000
    return magnitud === 'potencia' ? deBuffer(bufDrives, p => p.power, desde)
      : { ...deBuffer(bufFlows, p => p.flow, desde, 'F:'), ...deBuffer(bufDrives, p => p.flow, desde, '', n => manuales.has(n)) }
  }, [bufDrives, bufFlows, magnitud, ventanaH, manuales])

  const data = useMemo(() => sumarRetenido(deInflux ?? deMemoria ?? {}).map(p => ({ ts: p.ts, v: magnitud === 'caudal' ? aLps(p.v) : p.v })),
    [deInflux, deMemoria, magnitud])

  const unit = magnitud === 'potencia' ? 'kW' : UNIDAD_CAUDAL
  const label = magnitud === 'potencia' ? 'Potencia total' : 'Caudal total'
  return (
    <TrendChart title={`TENDENCIA · ${label} (${unit}) · ${ventanaH} H`} data={data} unit={unit} height={220} yDomain={['auto', 'auto']}
      decimals={magnitud === 'caudal' ? 1 : 0} series={[{ key: 'v', label, color: colorMagnitud(magnitud) }]} />
  )
}
