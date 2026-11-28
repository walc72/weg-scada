import { useMemo } from 'react'
import { Link } from 'react-router'
import { useDrivesStore, computeStats } from '../store/drives'
import { useNow } from '../lib/useNow'
import { cn } from '../lib/utils'
import { Estado, type Prioridad } from './SimboloEstado'

// Resumen de planta siempre visible en el encabezado: alarmas por prioridad,
// comunicación y backup. Componente propio para que los mensajes MQTT no
// re-rendericen toda la App.
// ponytail: prioridades derivadas del estado en vivo (alta = falla, baja = alarma
// por umbral, círculo «?» = sin comunicación); pasar a /api/alarms cuando haya ACK.
export default function StatusBar({ backupErr }: { backupErr: boolean }) {
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const listo = useDrivesStore(s => s.listo)
  const s = useMemo(() => computeStats(drives), [drives])
  const metersOff = useMemo(() => [...meters.values()].filter(m => !m.online).length, [meters])
  const total = s.total + meters.size
  const online = s.online + meters.size - metersOff
  // Mismos símbolos que la lista de alarmas: alta = equipos en falla, baja = alarmas por umbral,
  // dato no válido = equipos sin comunicación. En cero quedan grises, sin símbolo de color.
  const p: { k: string; prio: Prioridad; n: number; title: string }[] = [
    { k: 'alta', prio: 'alta', n: s.faults, title: 'Equipos en falla (alta)' },
    { k: 'com', prio: 'invalido', n: s.offline + metersOff, title: 'Equipos sin comunicación' },
    { k: 'baja', prio: 'baja', n: s.alarms, title: 'Alarmas por umbral (baja)' },
  ]

  return (
    <div className="flex items-center gap-4 flex-wrap justify-end">
      <div className="flex items-center gap-1.5">
        <span className="hidden lg:inline text-[10px] text-muted-foreground tracking-widest mr-1">ALARMAS</span>
        {p.map(x => {
          const activo = listo && x.n > 0
          return (
            <Link key={x.k} to="/alarmas" title={`${x.title}: ${listo ? x.n : '—'}`} aria-label={`${x.title}: ${listo ? x.n : '—'}`}
              className={cn('flex items-center gap-1.5 px-2 py-1 border border-border font-mono text-xs font-bold', activo ? 'text-foreground' : 'text-muted-foreground')}>
              {activo
                ? <Estado prioridad={x.prio} blink={x.prio === 'alta'}>{x.n}</Estado>
                : <span className="opacity-60"><Estado prioridad={x.prio} variante="reconocida">{listo ? x.n : '—'}</Estado></span>}
            </Link>
          )
        })}
      </div>
      <div className="hidden md:flex items-center gap-4 pl-4 border-l border-border">
        <Dato label="COMUNICACIÓN">
          {listo && online < total
            ? <Estado prioridad="invalido" tamano="chico">{online}/{total} en línea</Estado>
            : <span>{listo ? `${online}/${total} en línea` : '—'}</span>}
        </Dato>
        {backupErr && (
          <Link to="/config?tab=backups" className="no-underline">
            <Dato label="BACKUP"><span className="font-bold">ERROR</span></Dato>
          </Link>
        )}
        <Reloj />
      </div>
    </div>
  )
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] text-muted-foreground tracking-widest">{label}</span>
      <span className="text-xs font-mono text-foreground">{children}</span>
    </div>
  )
}

// Aparte: re-renderiza cada segundo sin arrastrar al resto
function Reloj() {
  const d = new Date(useNow(1000))
  return (
    <div className="flex flex-col leading-tight text-right font-mono">
      <span className="text-sm font-semibold">{d.toLocaleTimeString('es-AR', { hour12: false })}</span>
      <span className="text-[11px] text-muted-foreground">{d.toLocaleDateString('es-AR')}</span>
    </div>
  )
}
