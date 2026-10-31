import { Link } from 'react-router-dom'
import type { Drive } from '../types'
import { driveHasAnyAlarm, driveAlarmLabel } from '../store/drives'

// Franja con la condición más grave en curso (P1 falla > P2 sin comunicación >
// P3 alarma). Sin nada anormal no se muestra.
// ponytail: sale del estado en vivo; con ACK en el backend pasa a la lista de alarmas sin reconocer.
export default function AlarmBanner({ drives }: { drives: Drive[] }) {
  const falla = drives.filter(d => d.online && d.hasFault)
  const sinCom = drives.filter(d => !d.online && d.license !== 'excedido')
  const alarma = drives.filter(d => d.online && !d.hasFault && driveHasAnyAlarm(d))
  const total = falla.length + sinCom.length + alarma.length
  const top = falla[0]
    ? { p: 'P1', bg: 'var(--p1)', d: falla[0], txt: `FALLA DE DRIVE · ${falla[0].faultText || ''}` }
    : sinCom[0]
      ? { p: 'P2', bg: 'var(--p2)', d: sinCom[0], txt: sinCom[0].sinEnlace ? `SIN ENLACE · ${sinCom[0].sinEnlace}` : 'SIN COMUNICACIÓN' }
      : alarma[0]
        ? { p: 'P3', bg: 'var(--p3)', d: alarma[0], txt: `ALARMA · ${driveAlarmLabel(alarma[0]) || 'Activa'}` }
        : null
  if (!top) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 border" style={{ borderColor: top.bg, background: `color-mix(in srgb, ${top.bg} 12%, hsl(var(--card)))` }}>
      <span className={`px-2 py-0.5 font-mono text-xs font-bold ${top.p === 'P1' ? 'blink' : ''}`} style={{ background: top.bg, color: '#16191C' }}>{top.p}</span>
      <span className="text-sm font-bold tracking-wide">{top.d.displayName || top.d.name}</span>
      <span className="text-sm truncate min-w-0">{top.txt}</span>
      <Link to="/alarmas" className="ml-auto flex items-center min-h-[32px] px-3.5 border border-foreground/40 text-xs font-semibold tracking-wider text-foreground hover:bg-muted">
        VER ALARMAS ({total})
      </Link>
    </div>
  )
}
