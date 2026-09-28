import { Card } from './ui/card'
import HalfGauge from './HalfGauge'
import { AlertTriangle, Zap, CheckCircle, Loader2 } from 'lucide-react'

interface Stats {
  total: number
  online: number
  running: number
  faults: number
  alarms: number
  offline: number
  color: string
  icon: string
  text: string
}

const ICONS: Record<string, React.ElementType> = {
  alert: AlertTriangle,
  bolt: Zap,
  check: CheckCircle,
  loader: Loader2
}

// `connected` queda por compatibilidad: el estado de conexión ya se muestra en
// el encabezado de la app, acá se reemplazó por el gauge de bombas en marcha.
export default function Banner({ stats }: { stats: Stats; connected?: boolean }) {
  const Icon = ICONS[stats.icon] ?? CheckCircle
  const total = Math.max(1, stats.total)
  return (
    <Card className="p-4 border-l-4" style={{ borderLeftColor: stats.color }}>
      <div className="flex items-center gap-4">
        <Icon className="h-8 w-8 shrink-0" style={{ color: stats.color }} />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold truncate" style={{ color: stats.color }}>
            {stats.text}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Total: {stats.total} · Online: {stats.online} · Marcha: {stats.running} · Fallas: {stats.faults} · Alarmas: {stats.alarms} · Offline: {stats.offline}
          </div>
        </div>
        {/* Gauge: bombas en marcha sobre el total */}
        <div className="w-32 sm:w-36 shrink-0" title={`${stats.running} de ${stats.total} bombas en marcha`}>
          <HalfGauge value={stats.running} label="En marcha" unit={`/ ${stats.total}`}
            min={0} max={total} green={total} yellow={total} decimals={0} plain c1="#3b82f6" />
        </div>
      </div>
    </Card>
  )
}
