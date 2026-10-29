import { Link } from 'react-router-dom'
import { X, AlertTriangle } from 'lucide-react'
import { puntosLibres, fmtMed, Luz } from './CampoBase'
import type { CampoState, CampoConfig } from '../types'

// Panel lateral con todas las mediciones y señales de un equipo
export default function CampoDetalle({ st, cfg, onClose }: { st?: CampoState; cfg: CampoConfig; onClose: () => void }) {
  const { meds, senales } = puntosLibres(cfg)
  const live = !!st?.online // offline: sin valores viejos
  const alarmas = live ? Object.values(st!.alarmas) : []
  const h = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2'
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-background border-l shadow-xl overflow-y-auto p-4 flex flex-col gap-5" role="dialog" aria-label={cfg.name}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-base">{cfg.name} <span className="text-xs font-normal text-muted-foreground">{cfg.modelo}</span></div>
        <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      {!live && <div className="text-sm text-muted-foreground">Equipo sin conexión</div>}
      <section>
        <div className={h}>Mediciones</div>
        {meds.length === 0 ? <div className="text-sm text-muted-foreground">Sin mediciones libres</div> : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
            {meds.map(p => <div key={p.nombre} className="contents"><dt className="text-muted-foreground">{p.nombre}</dt><dd className="font-semibold text-right">{live ? fmtMed(st, p) : '—'}</dd></div>)}
          </dl>
        )}
      </section>
      <section>
        <div className={h}>Señales</div>
        {senales.length === 0 ? <div className="text-sm text-muted-foreground">Sin señales libres</div> : (
          <div className="flex flex-col gap-1">{senales.map(p => <Luz key={p.nombre} on={live ? st?.senales?.[p.nombre!] : null} label={p.nombre!} />)}</div>
        )}
      </section>
      <section>
        <div className={h}>Alarmas activas</div>
        {alarmas.length === 0 ? <div className="text-sm text-muted-foreground">Ninguna</div> : alarmas.map(t => (
          <div key={t} className="flex items-center gap-1.5 text-xs font-semibold text-red-600"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t}</div>
        ))}
      </section>
      <Link to="/historicos" className="text-sm text-primary underline">Ver en Tendencias</Link>
    </div>
  )
}
