import { memo } from 'react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import HalfGauge from './HalfGauge'
import type { Meter } from '../types'
import { Zap, CheckCircle, PowerOff, WifiOff, TrendingUp } from 'lucide-react'
import { isStale } from '../store/drives'
import { useNow } from '@/lib/useNow'
import { useConfigStore } from '../store/config'

interface Props {
  m: Meter
  zones?: Record<string, any>
  meterName?: string
  energyKwh?: number
  maxPowerKw?: number   // potencia máxima alcanzada en el día (kW)
  hero?: boolean
}

export default memo(function PM8000Card({ m, zones, meterName, energyKwh, maxPowerKw, hero }: Props) {
  const z = zones ?? {}
  const now = useNow()
  const stale = m.online && isStale(m._ts, now)
  const plainMap = useConfigStore(s => s.config?.plainGauges?.[m.name])
  const pl = (k: string) => plainMap?.['*'] === true || plainMap?.[k] === true

  const v = z.voltage || { min: 0, max: 36, redLow: 30, green: 33, yellow: 34.5 }
  const i = z.current || { min: 0, max: 200, green: 120, yellow: 170 }
  const p = z.power   || { min: 0, max: 2000, green: 1500, yellow: 1800 }
  const f = z.pf      || { min: 0, max: 1, green: 0.85, yellow: 0.95 }

  const title = meterName || m.name

  // Inductivo (i) / capacitivo (c) según el signo de la reactiva (Q).
  // Q > 0 = inductivo (atraso), Q < 0 = capacitivo (adelanto). Sin dato → sin etiqueta.
  const pfSuffix = m.reactive == null || m.reactive === 0 ? '' : (m.reactive > 0 ? 'i' : 'c')

  const gauges = [
    { key: 'voltage', value: (m.voltage || 0) / 1000, label: 'Tensión L-L', unit: 'kV', ...v, decimals: 2 },
    { key: 'current', value: m.current || 0,          label: 'Corriente',   unit: 'A',  ...i },
    { key: 'power',   value: (m.power || 0) / 1000,   label: 'Potencia',    unit: 'kW', ...p },
    { key: 'pf',      value: m.pf || 0,               label: 'Factor Pot.', unit: '',   ...f, decimals: 2, bipolar: true, suffix: pfSuffix }
  ]

  return (
    <Card className="border-l-4" style={{ borderLeftColor: stale ? '#9ca3af' : m.online ? '#16a34a' : '#9ca3af' }}>
      <div className="flex items-start justify-between gap-x-3 gap-y-1 flex-wrap p-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className={hero ? 'h-6 w-6 text-primary shrink-0' : 'h-5 w-5 text-primary shrink-0'} />
          <span className={hero ? 'font-bold text-lg sm:text-xl break-words' : 'font-bold text-base break-words'}>{title}</span>
          <Badge variant="secondary" className="shrink-0">{m.type || 'PM8000'}</Badge>
        </div>
        {stale ? (
          <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold shrink-0">
            <WifiOff className="h-3 w-3" /> DESACTUALIZADO
          </Badge>
        ) : m.online ? (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {typeof maxPowerKw === 'number' && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground tabular-nums" title="Potencia máxima alcanzada hoy (desde 00:00)">
                <TrendingUp className="h-3 w-3" />
                {Math.abs(maxPowerKw) >= 100 ? maxPowerKw.toFixed(0) : maxPowerKw.toFixed(1)} kW máx
              </span>
            )}
            {typeof energyKwh === 'number' && (
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground tabular-nums" title="Energía acumulada de hoy (desde 00:00, igual que el Reporte Diario)">
                <Zap className="h-3 w-3" />
                {energyKwh >= 100 ? energyKwh.toFixed(0) : energyKwh.toFixed(1)} kWh hoy
              </span>
            )}
            {m.frequency ? (
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {m.frequency.toFixed(2)} Hz
              </span>
            ) : null}
            <Badge variant="success" className="gap-1 px-3 py-1 text-xs font-bold">
              <CheckCircle className="h-3 w-3" /> ONLINE
            </Badge>
          </div>
        ) : (
          <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold">
            <PowerOff className="h-3 w-3" /> OFFLINE
          </Badge>
        )}
      </div>
      <div className="border-b" />
      {m.online ? (
        <div className={hero ? 'grid grid-cols-2 sm:grid-cols-4 gap-4 p-5' : 'grid grid-cols-2 sm:grid-cols-4 gap-2 p-4'}>
          {gauges.map(({ key: gk, ...g }) => <HalfGauge key={gk} {...g} stale={stale} big={hero} plain={pl(gk)} />)}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <PowerOff className="h-9 w-9 mx-auto mb-1 opacity-50" />
          <div className="text-sm">Medidor sin conexión</div>
        </div>
      )}
    </Card>
  )
})
