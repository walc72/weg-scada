import { Card } from './ui/card'
import { AlertTriangle, Zap, CheckCircle, Loader2 } from 'lucide-react'
import type { Drive } from '../types'
import { driveHasAnyAlarm } from '../store/drives'

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

// Estado de cada bomba para la barra de segmentos
function segment(d: Drive): { color: string; label: string } {
  if (!d.online) return { color: 'hsl(var(--muted-foreground) / 0.2)', label: 'offline' }
  if (d.hasFault) return { color: '#ef4444', label: 'falla' }
  if (driveHasAnyAlarm(d)) return { color: '#f59e0b', label: 'alarma' }
  if (d.running) return { color: '#3b82f6', label: 'en marcha' }
  return { color: '#94a3b8', label: 'detenida' }
}

// `connected` queda por compatibilidad: el estado de conexión ya se muestra en
// el encabezado de la app. A la izquierda: bombas en marcha / total y una barra
// con un segmento por bomba (azul marcha, gris detenida, rojo falla, ámbar
// alarma, apagado offline). El texto de fallas/alarmas solo aparece si hay.
export default function Banner({ stats, drives = [] }: { stats: Stats; drives?: Drive[]; connected?: boolean }) {
  const Icon = ICONS[stats.icon] ?? CheckCircle
  const problem = stats.faults > 0 || stats.alarms > 0
  return (
    <Card className="px-4 py-2.5 border-l-4" style={{ borderLeftColor: stats.color }}>
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 shrink-0" style={{ color: stats.color }} />
        <div className="shrink-0 flex items-center gap-2.5" title={`${stats.running} de ${stats.total} bombas en marcha`}>
          <div className="leading-none">
            <div className="tabular-nums">
              <span className="text-2xl font-bold" style={{ color: '#3b82f6' }}>{stats.running}</span>
              <span className="text-sm text-muted-foreground"> / {stats.total}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">En marcha</div>
          </div>
          {drives.length > 0 && (
            <div className="flex gap-1">
              {drives.map(d => {
                const s = segment(d)
                return (
                  <span key={d.name} className="h-7 w-2.5 rounded-sm"
                    style={{ background: s.color }} title={`${d.displayName || d.name}: ${s.label}`} />
                )
              })}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 border-l border-border pl-3">
          {problem && (
            <div className="text-sm font-bold truncate leading-tight" style={{ color: stats.color }} title={stats.text}>
              {stats.text}
            </div>
          )}
          <div className="text-xs text-muted-foreground truncate">
            Total: {stats.total} · Online: {stats.online} · Marcha: {stats.running} · Fallas: {stats.faults} · Alarmas: {stats.alarms} · Offline: {stats.offline}
          </div>
        </div>
      </div>
    </Card>
  )
}
