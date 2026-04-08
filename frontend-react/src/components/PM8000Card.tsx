import { Card } from './ui/card'
import { Badge } from './ui/badge'
import HalfGauge from './HalfGauge'
import type { Meter } from '../types'
import { Zap, CheckCircle, PowerOff } from 'lucide-react'

export default function PM8000Card({ m }: { m: Meter }) {
  const title = m.uiConfig?.title || 'Medición Línea Exclusiva'
  const c = m.uiConfig?.zones || {} as any
  const v = c.voltage || { min: 0, max: 36, green: 33, yellow: 34.5 }
  const i = c.current || { min: 0, max: 200, green: 120, yellow: 170 }
  const p = c.power   || { min: 0, max: 2000, green: 1500, yellow: 1800 }
  const f = c.pf      || { min: 0, max: 1, green: 0.85, yellow: 0.95 }

  const gauges = [
    { value: (m.voltage || 0) / 1000, label: 'Tensión L-L', unit: 'kV', ...v, decimals: 2 },
    { value: m.current || 0,          label: 'Corriente',   unit: 'A',  ...i },
    { value: (m.power || 0) / 1000,   label: 'Potencia',    unit: 'kW', ...p },
    { value: Math.abs(m.pf || 0),     label: 'Factor Pot.', unit: '',   ...f, decimals: 3, invert: true }
  ]

  return (
    <Card className="border-l-4" style={{ borderLeftColor: m.online ? '#16a34a' : '#9ca3af' }}>
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-bold text-base">{title}</span>
          <Badge variant="purple" className="text-[10px]">PM8000</Badge>
        </div>
        {m.online ? (
          <Badge variant="success" className="gap-1 px-3 py-1 text-xs font-bold">
            <CheckCircle className="h-3 w-3" /> ONLINE
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold">
            <PowerOff className="h-3 w-3" /> OFFLINE
          </Badge>
        )}
      </div>
      <div className="border-b" />
      {m.online ? (
        <div className="grid grid-cols-4 gap-2 p-4">
          {gauges.map((g) => <HalfGauge key={g.label} {...g} />)}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <PowerOff className="h-9 w-9 mx-auto mb-1 opacity-50" />
          <div className="text-sm">Medidor sin conexión</div>
        </div>
      )}
    </Card>
  )
}
