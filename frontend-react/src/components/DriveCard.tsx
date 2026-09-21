import { memo } from 'react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import HalfGauge from './HalfGauge'
import type { Drive } from '../types'
import { Play, Pause, AlertCircle, CheckCircle, PowerOff, Clock, WifiOff, Zap } from 'lucide-react'
import { cn, fmt } from '@/lib/utils'
import { resolveZone, type GaugeKey, type GaugeZone } from '../lib/gaugeDefaults'
import { isStale } from '../store/drives'
import { useNow } from '@/lib/useNow'
import { useConfigStore } from '../store/config'

const OK = '#22c55e', WARN = '#f59e0b', BAD = '#ef4444'

export default memo(function DriveCard({ d, gaugeZones, energyKwh }: { d: Drive; gaugeZones: Record<string, Record<string, Partial<GaugeZone>>>; energyKwh?: number }) {
  const isCFW = d.type !== 'SSW900'
  const now = useNow()
  // Setpoints por equipo: default por tipo + override por nombre
  const alarmSetpoints = useConfigStore(s => s.config?.alarmSetpoints)
  const sp: Record<string, number> = {
    ...(alarmSetpoints?.defaults?.[d.type] ?? {}),
    ...(alarmSetpoints?.overrides?.[d.name] ?? {}),
  }
  // Datos viejos: el equipo figura online pero hace >8s que no actualiza.
  const stale = d.online && isStale(d._ts, now)

  function zone(key: GaugeKey) {
    return resolveZone(d.type, key, gaugeZones?.[d.name]?.[key])
  }

  const borderColor =
    stale ? '#9ca3af'
    : d.running ? '#2563eb'
    : d.ready ? '#16a34a'
    : d.fault ? '#dc2626'
    : d.online ? '#f59e0b'
    : '#9ca3af'

  const chipVariant: 'info' | 'success' | 'destructive' | 'warning' | 'secondary' =
    stale ? 'secondary'
    : d.running ? 'info'
    : d.ready ? 'success'
    : d.fault ? 'destructive'
    : d.online ? 'warning'
    : 'secondary'

  const ChipIcon =
    stale ? WifiOff
    : d.running ? Play
    : d.ready ? CheckCircle
    : d.fault ? AlertCircle
    : d.online ? Pause
    : PowerOff

  const chipText =
    stale ? 'DESACTUALIZADO'
    : d.running ? 'EN MARCHA'
    : d.ready ? 'LISTO'
    : d.fault ? 'FALLA'
    : d.online ? 'PARADO'
    : 'OFFLINE'

  const tempVal = isCFW ? (d.igbtTemp || 0) : (d.scrTemp || 0)
  const tempLabel = isCFW ? 'Temp. IGBT' : 'Temp. SCR'

  // ── Colores por setpoint (por equipo) ──
  const tempHigh = sp.tempHigh ?? 90
  const tempColor = stale ? '#9ca3af' : tempVal >= tempHigh ? BAD : tempVal >= tempHigh * 0.85 ? WARN : OK
  // Cos φ: bajo = malo
  const pfLow = sp.cosPhiLow ?? 0.85
  const cosColor = stale ? '#9ca3af' : d.cosPhi >= pfLow ? OK : d.cosPhi >= pfLow - 0.15 ? WARN : BAD
  // Potencia: solo si hay límite configurado (powerHigh), si no queda neutro
  const powerHigh = typeof sp.powerHigh === 'number' ? sp.powerHigh : undefined
  const powerColor = stale ? '#9ca3af'
    : powerHigh ? (d.power >= powerHigh ? BAD : d.power >= powerHigh * 0.85 ? WARN : OK)
    : undefined
  // Torque (%): sobrecarga por magnitud (permite regeneración con signo negativo)
  const torqueMag = Math.abs(d.torque || 0)
  const torqueColor = stale ? '#9ca3af' : torqueMag >= 120 ? BAD : torqueMag >= 100 ? WARN : OK

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
          {gauges.map((g) => <HalfGauge key={g.label} {...g} stale={stale} />)}
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
          <div className="bg-muted/50 rounded-md px-2.5 py-2 border-l-[3px]" style={{ borderLeftColor: powerColor || '#8b8b8b' }}>
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Potencia</div>
            <div className="text-lg font-semibold tabular-nums leading-tight" style={{ color: powerColor }}>{fmt(d.power)} <span className="text-xs font-normal text-muted-foreground">kW</span></div>
          </div>
          <div className="bg-muted/50 rounded-md px-2.5 py-2 border-l-[3px]" style={{ borderLeftColor: cosColor }}>
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Cos φ</div>
            <div className="text-lg font-semibold tabular-nums leading-tight" style={{ color: cosColor }}>{fmt(d.cosPhi)}</div>
          </div>
          <div className="bg-muted/50 rounded-md px-2.5 py-2 border-l-[3px]" style={{ borderLeftColor: tempColor }}>
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{tempLabel}</div>
            <div className="text-lg font-semibold tabular-nums leading-tight" style={{ color: tempColor }}>
              {fmt(tempVal, 1)} <span className="text-xs font-normal text-muted-foreground">°C</span>
            </div>
          </div>
          {isCFW && (
            <div className="bg-muted/50 rounded-md px-2.5 py-2 border-l-[3px]" style={{ borderLeftColor: '#8b8b8b' }}>
              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Bus DC</div>
              <div className="text-lg font-semibold tabular-nums leading-tight">
                {fmt(d.dcLink || 0, 0)} <span className="text-xs font-normal text-muted-foreground">V</span>
              </div>
            </div>
          )}
          {isCFW && (
            <div className="bg-muted/50 rounded-md px-2.5 py-2 border-l-[3px]" style={{ borderLeftColor: torqueColor }}>
              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Torque</div>
              <div className="text-lg font-semibold tabular-nums leading-tight" style={{ color: torqueColor }}>
                {fmt(d.torque || 0, 1)} <span className="text-xs font-normal text-muted-foreground">%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {d.hasFault && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs ">
          <strong>FALLA:</strong> {d.faultText}
        </div>
      )}

      <div className="flex-1" />

      {d.online && (
        <div className="flex items-center justify-between px-4 pb-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {d.hoursEnergized !== '-' ? (
                <span className="font-bold text-foreground">{d.hoursEnergized}h enc | {d.hoursEnabled}h hab</span>
              ) : (
                <span>Soft Starter</span>
              )}
            </div>
            {typeof energyKwh === 'number' && (
              <span className="flex items-center gap-1" title="Energía acumulada de hoy">
                <Zap className="h-3 w-3" />
                <span className="font-bold text-foreground">{fmt(energyKwh, energyKwh >= 100 ? 0 : 1)} kWh hoy</span>
              </span>
            )}
          </div>
          <Badge variant={d.hasFault ? 'destructive' : 'success'} className="text-[10px] py-0">
            {d.hasFault ? d.faultText : 'Sin Falla'}
          </Badge>
        </div>
      )}
    </Card>
  )
})
