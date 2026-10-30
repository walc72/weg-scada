import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, AlertTriangle } from 'lucide-react'
import { fmt, puntosLibres, fmtMed, Luz } from '../CampoBase'
import Mimico from '../Mimico'
import Fasorial, { fasorEquipos } from '../Fasorial'
import type { Vivos } from '../../lib/energizar'
import type { Nodo } from '../../lib/unifilar'
import Mediciones, { FIJAS, equipoDe, fresco } from './Mediciones'
import TendenciaEquipo from './TendenciaEquipo'

const h = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2'

// Panel lateral de un equipo del unifilar: sus valores; un banco suma mímico y fasorial
export default function PanelEquipo({ nodo, vivos, onClose }: { nodo: Nodo; vivos: Vivos; onClose: () => void }) {
  const eq = equipoDe(nodo, vivos)
  const banco = nodo.banco != null
  // Esc cierra el panel
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  // todas las mediciones fijas del tipo (medidor, bomba): las mismas líneas que junto al símbolo
  const fijas = eq.meter || eq.drive ? { ...nodo, mostrar: Object.keys(FIJAS[nodo.tipo] ?? {}) } : null
  const fl = nodo.tipo === 'caudalimetro' ? vivos.flowmeters.get(eq.nombre) : undefined
  const cfgs = eq.campos.map(c => c.cfg)
  return (
    <>
      {/* tocar fuera del panel lo cierra */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l shadow-xl overflow-y-auto p-4 flex flex-col gap-5" role="dialog" aria-label={eq.nombre}>
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-base">{eq.nombre}{banco && <span className="ml-2 text-xs font-normal text-muted-foreground">banco de reguladores</span>}</div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {!eq.existe && <div className="text-sm text-amber-500">Equipo no encontrado en la configuración</div>}
        {banco && eq.existe && (
          <section className="flex flex-col gap-4">
            <Mimico regs={cfgs} campo={vivos.campo} />
            <Fasorial equipos={fasorEquipos(cfgs, vivos.campo)} size={200} lado />
            <Mediciones nodo={{ ...nodo, mostrar: Object.keys(FIJAS.reg) }} vivos={vivos} />
          </section>
        )}
        {fijas && <Mediciones nodo={fijas as Nodo} vivos={vivos} />}
        {fl && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Caudal</dt><dd className="font-semibold text-right">{fresco(fl, vivos) ? fmt(fl.flow, 1, 'm³/h') : '—'}</dd>
            <dt className="text-muted-foreground">Totalizador</dt><dd className="font-semibold text-right">{fresco(fl, vivos) ? fmt(fl.total, 0, 'm³') : '—'}</dd>
          </dl>
        )}
        {eq.campos.map(({ cfg, st }) => {
          const { meds, senales } = puntosLibres(cfg)
          const live = fresco(st, vivos) // sin comunicación: sin valores viejos
          const alarmas = live ? Object.values(st!.alarmas) : []
          return (
            <div key={cfg.name} className="flex flex-col gap-4">
              {(banco || eq.campos.length > 1) && <div className="font-semibold text-sm">{cfg.name} <span className="text-xs font-normal text-muted-foreground">{cfg.modelo}</span></div>}
              {!live && <div className="text-sm text-muted-foreground">Equipo sin conexión</div>}
              <section>
                <div className={h}>Mediciones</div>
                {meds.length === 0 ? <div className="text-sm text-muted-foreground">Sin mediciones libres</div> : (
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
                    {meds.map(p => <div key={p.nombre} className="contents"><dt className="text-muted-foreground">{p.nombre}</dt><dd className="font-semibold text-right">{live ? fmtMed(st, p) : '—'}</dd></div>)}
                  </dl>
                )}
              </section>
              {senales.length > 0 && (
                <section>
                  <div className={h}>Señales</div>
                  <div className="flex flex-col gap-1">{senales.map(p => <Luz key={p.nombre} on={live ? st?.senales?.[p.nombre!] : null} label={p.nombre!} />)}</div>
                </section>
              )}
              <section>
                <div className={h}>Alarmas activas</div>
                {alarmas.length === 0 ? <div className="text-sm text-muted-foreground">Ninguna</div> : alarmas.map(t => (
                  <div key={t} className="flex items-center gap-1.5 text-xs font-semibold text-red-600"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t}</div>
                ))}
              </section>
            </div>
          )
        })}
        {eq.existe && <TendenciaEquipo nodo={nodo} config={vivos.config} />}
        <div className="flex gap-4 text-sm">
          <Link to="/" className="text-primary underline">Ver en Dashboard</Link>
          <Link to="/historicos" className="text-primary underline">Ver en Tendencias</Link>
        </div>
      </div>
    </>
  )
}
