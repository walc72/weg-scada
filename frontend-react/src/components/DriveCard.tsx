import { Card } from './ui/card'
import { Badge } from './ui/badge'
import HalfGauge from './HalfGauge'
import type { Drive } from '../types'
import { Play, Pause, AlertCircle, CheckCircle, PowerOff, Clock } from 'lucide-react'
import { cn, fmt } from '@/lib/utils'
import { resolveZone, type GaugeKey, type GaugeZone } from '../lib/gaugeDefaults'

export default function DriveCard({ d, gaugeZones }: { d: Drive; gaugeZones: Record<string, Record<string, Partial<GaugeZone>>> }) {
  const isCFW = d.type !== 'SSW900'

  function zone(key: GaugeKey) {
    return resolveZone(d.type, key, gaugeZones?.[d.name]?.[key])
  }

  const borderColor =
    d.running ? '#2563eb'
    : d.ready ? '#16a34a'
    : d.fault ? '#dc2626'
    : d.online ? '#f59e0b'
    : '#9ca3af'

  const chipVariant: 'info' | 'success' | 'destructive' | 'warning' | 'secondary' =
    d.running ? 'info'
    : d.ready ? 'success'
    : d.fault ? 'destructive'
    : d.online ? 'warning'
    : 'secondary'

  const ChipIcon =
    d.running ? Play
    : d.ready ? CheckCircle
    : d.fault ? AlertCircle
    : d.online ? Pause
    : PowerOff

  const chipText =
    d.running ? 'EN MARCHA'
    : d.ready ? 'LISTO'
    : d.fault ? 'FALLA'
    : d.online ? 'PARADO'
    : 'OFFLINE'

  const tempVal = isCFW ? (d.igbtTemp || 0) : (d.scrTemp || 0)
  const tempLabel = isCFW ? 'Temp. IGBT' : 'Temp. SCR'
  const tempColor = tempVal > 80 ? '#ef4444' : tempVal > 60 ? '#f59e0b' : '#22c55e'

  const gauges: Array<{
    value: number; label: string; unit: string;
    min: number; max: number; green: number; yellow: number
  }> = []
  if (isCFW) gauges.push({ value: d.motorSpeed    || 0, label: 'Velocidad',     unit: 'RPM', ...zone('velocidad')  })
  gauges.push(          { value: d.current        || 0, label: 'Corriente',     unit: 'A',   ...zone('corriente')  })
  gauges.push(          { value: d.outputVoltage  || 0, label: 'Tensión Salida',unit: 'V',   ...zone('tension')    })
  if (isCFW) gauges.push({ value: d.frequency     || 0, label: 'Frecuencia',    unit: 'Hz',  ...zone('frecuencia') })

  return (
    <Card className="overflow-hidden flex flex-col h-full border-l-4" style={{ borderLeftColor: borderColor }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-base truncate">{d.displayName || d.name}</span>
          <Badge variant="secondary" className="shrink-0">{d.type}</Badge>
        </div>
        <Badge variant={chipVariant} className="shrink-0 gap-1 px-3 py-1 text-xs font-bold tracking-wide">
          <ChipIcon className="h-3 w-3" />
          {chipText}
        </Badge>
      </div>

      <div className="border-b" />

      {/* Gauges */}
      {d.online ? (
        <div className={cn('grid gap-1 p-3 pt-3 text-center', `grid-cols-${gauges.length}`)} style={{ gridTemplateColumns: `repeat(${gauges.length}, minmax(0, 1fr))` }}>
          {gauges.map((g) => <HalfGauge key={g.label} {...g} />)}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <PowerOff className="h-9 w-9 mx-auto mb-1 opacity-50" />
          <div className="text-sm">Drive sin conexión</div>
        </div>
      )}

      {/* Metrics */}
      {d.online && (
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-2">
          <div className="bg-muted/50 rounded-md px-2 py-2 border-l-[3px] border-amber-500">
            <div className="text-[0.7em] text-muted-foreground font-semibold uppercase">Potencia</div>
            <div className="text-xl font-bold font-mono">{fmt(d.power)} <span className="text-xs text-muted-foreground">kW</span></div>
          </div>
          <div className="bg-muted/50 rounded-md px-2 py-2 border-l-[3px] border-violet-500">
            <div className="text-[0.7em] text-muted-foreground font-semibold uppercase">Cos phi</div>
            <div className="text-xl font-bold font-mono">{fmt(d.cosPhi)}</div>
          </div>
          <div className="bg-muted/50 rounded-md px-2 py-2 border-l-[3px]" style={{ borderLeftColor: tempColor }}>
            <div className="text-[0.7em] text-muted-foreground font-semibold uppercase">{tempLabel}</div>
            <div className="text-xl font-bold font-mono" style={{ color: tempColor }}>
              {fmt(tempVal, 1)} <span className="text-xs text-muted-foreground">°C</span>
            </div>
          </div>
        </div>
      )}

      {d.hasFault && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs font-mono">
          <strong>FALLA:</strong> {d.faultText}
        </div>
      )}

      <div className="flex-1" />

      {d.online && (
        <div className="flex items-center justify-between px-4 pb-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {d.hoursEnergized !== '-' ? (
              <span className="font-bold text-foreground">{d.hoursEnergized}h enc | {d.hoursEnabled}h hab</span>
            ) : (
              <span>Soft Starter</span>
            )}
          </div>
          <Badge variant={d.hasFault ? 'destructive' : 'success'} className="text-[10px] py-0">
            {d.hasFault ? d.faultText : 'Sin Falla'}
          </Badge>
        </div>
      )}
    </Card>
  )
}
