import { Link } from 'react-router'
import type { Drive } from '../types'
import { driveHasAnyAlarm, driveAlarmLabel } from '../store/drives'
import { Estado, type Prioridad } from './SimboloEstado'

// Franja con la condición más grave en curso (falla = alta > sin comunicación = dato no válido > alarma = baja,
// el mismo orden que tenía con P1 > P2 > P3).
// Sin nada anormal no se muestra. Símbolos unificados de la marca: el color va en el símbolo y en el filete de la
// izquierda; el fondo de la franja queda neutro.
// ponytail: sale del estado en vivo; con ACK en el backend pasa a la lista de alarmas sin reconocer (hoy todo va como
// «sin reconocer»: símbolo relleno y texto en negrita).
export default function AlarmBanner({ drives }: { drives: Drive[] }) {
  const falla = drives.filter(d => d.online && d.hasFault)
  const sinCom = drives.filter(d => !d.online && d.license !== 'excedido' && !d.fueraServicio)
  const alarma = drives.filter(d => d.online && !d.hasFault && driveHasAnyAlarm(d))
  const total = falla.length + sinCom.length + alarma.length
  const top: { p: Prioridad; color: string; d: Drive; txt: string } | null = falla[0]
    ? { p: 'alta', color: 'var(--p1)', d: falla[0], txt: `FALLA DE DRIVE · ${falla[0].faultText || ''}` }
    : sinCom[0]
      ? { p: 'invalido', color: 'var(--st-com)', d: sinCom[0], txt: sinCom[0].sinEnlace ? `SIN ENLACE · ${sinCom[0].sinEnlace}` : 'SIN COMUNICACIÓN' }
      : alarma[0]
        ? { p: 'baja', color: 'var(--p3)', d: alarma[0], txt: `ALARMA · ${driveAlarmLabel(alarma[0]) || 'Activa'}` }
        : null
  if (!top) return null
  return (
    <div className="hlc-alarma--sin-reconocer flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 border bg-card" style={{ boxShadow: `inset 4px 0 0 ${top.color}` }}>
      <Estado prioridad={top.p} blink={top.p === 'alta'}>
        <span className="text-sm font-bold tracking-wide">{top.d.displayName || top.d.name}</span>
      </Estado>
      <span className="text-sm truncate min-w-0">{top.txt}</span>
      <Link to="/alarmas" className="ml-auto flex items-center min-h-[32px] px-3.5 border border-foreground/40 text-xs font-semibold tracking-wider text-foreground hover:bg-muted">
        VER ALARMAS ({total})
      </Link>
    </div>
  )
}
