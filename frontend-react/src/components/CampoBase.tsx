import { Badge } from './ui/badge'
import { SinEnlaceBadge } from './SinEnlaceBadge'
import type { CampoState, CampoConfig, Punto } from '../types'
import { PowerOff, CheckCircle, AlertTriangle } from 'lucide-react'

// Formato local (es-AR): punto de miles y coma decimal; un formateador por cantidad de decimales
const NUM = new Map<number, Intl.NumberFormat>()
export const num = (v: number, dec = 0): string => {
  let f = NUM.get(dec)
  if (!f) NUM.set(dec, f = new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }))
  return f.format(v)
}

// Valor numérico o «—» si falta / es null
export const fmt = (v: number | boolean | null | undefined, dec = 0, unit = ''): string =>
  typeof v === 'number' && isFinite(v) ? `${num(v, dec)}${unit ? ' ' + unit : ''}` : '—'

// Insignia de conexión común a ambas tarjetas
export function EstadoConexion({ st }: { st?: CampoState }) {
  if (st?.license === 'excedido') {
    return <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold shrink-0"><PowerOff className="h-3 w-3" /> Fuera de licencia</Badge>
  }
  if (!st) return <Badge variant="secondary" className="px-3 py-1 text-xs font-bold shrink-0">Esperando lectura</Badge>
  if (st.online) return <Badge variant="outline" className="gap-1 px-3 py-1 text-xs font-bold shrink-0"><CheckCircle className="h-3 w-3" /> ONLINE</Badge>
  return st.sinEnlace ? <SinEnlaceBadge name={st.sinEnlace} /> : (
    <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold shrink-0"><PowerOff className="h-3 w-3" /> OFFLINE</Badge>
  )
}

// Cuerpo cuando no hay lectura viva
export function SinLectura({ st }: { st?: CampoState }) {
  return (
    <div className="text-center py-8 text-muted-foreground text-sm">
      {!st ? 'Esperando lectura' : st.license === 'excedido' ? 'Fuera de licencia' : st.sinEnlace ? 'Sin enlace' : 'Equipo sin conexión'}
    </div>
  )
}

// Alarmas activas con su texto
export function Alarmas({ st }: { st?: CampoState }) {
  const items = Object.entries(st?.alarmas ?? {})
  if (!st?.online || items.length === 0) return null
  return (
    <div className="px-4 pb-4 flex flex-col gap-1">
      {items.map(([k, t]) => (
        <div key={k} className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t}
        </div>
      ))}
    </div>
  )
}

// Puntos libres del mapa; varias `med` con el mismo nombre son una sola medición (suma)
export function puntosLibres(cfg: CampoConfig) {
  const meds = new Map<string, Punto>()
  const senales = new Map<string, Punto>()
  for (const p of cfg.mapa ?? []) {
    if (!p.nombre) continue
    if (p.key === 'med' && !meds.has(p.nombre)) meds.set(p.nombre, p)
    else if (p.key === 'senal' && !senales.has(p.nombre)) senales.set(p.nombre, p)
  }
  return { meds: [...meds.values()], senales: [...senales.values()] }
}

export const fmtMed = (st: CampoState | undefined, p: Punto) =>
  fmt(st?.extras?.[p.nombre!], p.decimales ?? 0, p.unidad ?? '')

// Luz de señal: verde activa, gris inactiva / sin dato
export function Luz({ on, label }: { on: boolean | null | undefined; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
      {label}{on == null && ' (—)'}
    </span>
  )
}

// Medidas y señales principales para las tarjetas; solo con el equipo en línea
export function LibresPrincipales({ st, cfg }: { st?: CampoState; cfg: CampoConfig }) {
  const { meds, senales } = puntosLibres(cfg)
  const m = meds.filter(p => p.principal), s = senales.filter(p => p.principal)
  if (!st?.online || (m.length === 0 && s.length === 0)) return null
  return (
    <div className="px-4 pb-4 flex flex-col gap-2">
      {m.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
          {m.map(p => <div key={p.nombre}><span className="text-muted-foreground">{p.nombre}:</span> <span className="font-semibold">{fmtMed(st, p)}</span></div>)}
        </div>
      )}
      {s.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {s.map(p => <Luz key={p.nombre} on={st.senales?.[p.nombre!]} label={p.nombre!} />)}
        </div>
      )}
    </div>
  )
}
