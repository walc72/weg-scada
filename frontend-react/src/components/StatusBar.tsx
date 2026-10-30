import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDrivesStore, computeStats } from '../store/drives'
import { useNow } from '../lib/useNow'
import { cn } from '../lib/utils'

// Resumen de planta siempre visible en el encabezado: alarmas por prioridad,
// comunicación y backup. Componente propio para que los mensajes MQTT no
// re-rendericen toda la App.
// ponytail: prioridades derivadas del estado en vivo (P1 falla, P2 sin
// comunicación, P3 alarma por umbral); pasar a /api/alarms cuando haya ACK.
export default function StatusBar({ backupErr }: { backupErr: boolean }) {
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const s = useMemo(() => computeStats(drives), [drives])
  const metersOff = useMemo(() => [...meters.values()].filter(m => !m.online).length, [meters])
  const total = s.total + meters.size
  const online = s.online + meters.size - metersOff
  const p = [
    { k: 'P1', n: s.faults, bg: 'var(--p1)', title: 'Equipos en falla' },
    { k: 'P2', n: s.offline + metersOff, bg: 'var(--p2)', title: 'Equipos sin comunicación' },
    { k: 'P3', n: s.alarms, bg: 'var(--p3)', title: 'Alarmas por umbral' },
  ]

  return (
    <div className="flex items-center gap-4 flex-wrap justify-end">
      <div className="flex items-center gap-1.5">
        <span className="hidden lg:inline text-[10px] text-muted-foreground tracking-widest mr-1">ALARMAS</span>
        {p.map(x => (
          <Link key={x.k} to="/alarmas" title={`${x.title}: ${x.n}`}
            className={cn('flex items-center gap-1.5 px-2 py-1 font-mono text-xs font-bold', x.n > 0 && x.k === 'P1' && 'blink')}
            style={x.n > 0 ? { background: x.bg, color: '#16191C' } : { border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
            {x.k} <span>{x.n}</span>
          </Link>
        ))}
      </div>
      <div className="hidden md:flex items-center gap-4 pl-4 border-l border-border">
        <Dato label="COMUNICACIÓN">
          <span style={{ color: online < total ? 'var(--st-com)' : undefined }}>■</span> {online}/{total} OK
        </Dato>
        {backupErr && (
          <Link to="/config?tab=backups" className="no-underline">
            <Dato label="BACKUP"><span style={{ color: 'var(--p2-text)' }}>⚠ ERROR</span></Dato>
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
