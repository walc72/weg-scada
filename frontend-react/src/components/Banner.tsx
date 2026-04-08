import { Card } from './ui/card'
import { AlertTriangle, Zap, CheckCircle, Loader2, Wifi, WifiOff } from 'lucide-react'

interface Stats {
  total: number
  online: number
  running: number
  faults: number
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

export default function Banner({ stats, connected }: { stats: Stats; connected: boolean }) {
  const Icon = ICONS[stats.icon] ?? CheckCircle
  return (
    <Card className="p-4 border-l-4" style={{ borderLeftColor: stats.color }}>
      <div className="flex items-center gap-4">
        <Icon className="h-8 w-8 shrink-0" style={{ color: stats.color }} />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold truncate" style={{ color: stats.color }}>
            {stats.text}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Total: {stats.total} · Online: {stats.online} · Marcha: {stats.running} · Fallas: {stats.faults} · Offline: {stats.offline}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-semibold">
              <Wifi className="h-3.5 w-3.5" />
              CONECTADO
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-semibold">
              <WifiOff className="h-3.5 w-3.5" />
              SIN CONEXIÓN
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
