import { Badge } from './ui/badge'
import { SinEnlaceBadge } from './SinEnlaceBadge'
import type { CampoState, CampoConfig, Punto } from '../types'
import { PowerOff } from 'lucide-react'
import { Estado, SimboloEstado, type Prioridad } from './SimboloEstado'

// Formato local (es-AR): punto de miles y coma decimal; un formateador por cantidad de decimales
const NUM = new Map<number, Intl.NumberFormat>()
export const num = (v: number, dec = 0): string => {
  let f = NUM.get(dec)
  if (!f) NUM.set(dec, f = new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }))
  return f.format(v)
}

// Valor numérico o «—» si falta / es null
export const fmt = (v: number | boolean | null | undefined, dec = 0, unit = ''): string =>
  typeof v === 'number' && isFinite(v) ? `${num(v, dec)}${unit ? ' ' + unit : ''}` : '—'  // espacio que no corta: el número y la unidad siempre juntos

// Insignia de conexión común a ambas tarjetas. En línea no se pinta (texto neutro, sin símbolo); sin comunicación
// lleva el círculo violeta «?» y fuera de servicio el cuadrado gris con barra.
export function EstadoConexion({ st }: { st?: CampoState }) {
  if (st?.license === 'excedido') {
    return <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold shrink-0"><PowerOff className="h-3 w-3" /> Fuera de licencia</Badge>
  }
  if (st?.fueraServicio) return <Badge variant="outline" className="px-3 py-1 text-xs font-bold shrink-0 text-muted-foreground"><Estado prioridad="fuera-de-servicio">FUERA DE SERVICIO</Estado></Badge>
  if (!st) return <Badge variant="secondary" className="px-3 py-1 text-xs font-bold shrink-0">Esperando lectura</Badge>
  if (st.online) return <Badge variant="outline" className="px-3 py-1 text-xs font-bold shrink-0 text-muted-foreground">EN LÍNEA</Badge>
  return st.sinEnlace ? <SinEnlaceBadge name={st.sinEnlace} /> : (
    <Badge variant="outline" className="px-3 py-1 text-xs font-bold shrink-0"><Estado prioridad="invalido">SIN COMUNICACIÓN</Estado></Badge>
  )
}

// Cuerpo cuando no hay lectura viva
export function SinLectura({ st }: { st?: CampoState }) {
  return (
    <div className="text-center py-8 text-muted-foreground text-sm">
      {!st ? 'Esperando lectura' : st.fueraServicio ? 'Fuera de servicio' : st.license === 'excedido' ? 'Fuera de licencia' : st.sinEnlace ? 'Sin enlace' : 'Equipo sin conexión'}
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
        <Estado key={k} prioridad="alta" className="text-xs font-semibold">{t}</Estado>
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

// Luz de señal: llena activa, vacía inactiva / sin dato (sin verde: el color queda para estados)
export function Luz({ on, label }: { on: boolean | null | undefined; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2.5 w-2.5 rounded-full border border-foreground/60 ${on ? 'bg-foreground' : ''}`} />
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
          {/* valor y unidad juntos, sin cortar; el nombre se acorta si no entra */}
          {m.map(p => (
            <div key={p.nombre} className="flex items-baseline justify-between gap-2 min-w-0">
              <span className="text-muted-foreground truncate" title={p.nombre}>{p.nombre}</span>
              <span className="font-semibold whitespace-nowrap">{fmtMed(st, p)}</span>
            </div>
          ))}
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

// Rótulo de estado con los símbolos unificados de la marca HECIAN LC (components/SimboloEstado): el color va solo en
// el símbolo, el texto queda neutro. run (marcha/cerrado), off e info no llevan símbolo: lo normal no se pinta.
// p1 = alta (cuadrado «1»), p2 = media (triángulo «2»), p3 = baja (rombo «3»), com = sin comunicación (círculo «?»),
// fds = fuera de servicio (cuadrado gris con barra).
export type Tono = 'run' | 'p1' | 'p2' | 'p3' | 'com' | 'fds' | 'off' | 'info'
const PRIORIDAD: Partial<Record<Tono, Prioridad>> = { p1: 'alta', p2: 'media', p3: 'baja', com: 'invalido', fds: 'fuera-de-servicio' }
export function Chip({ tono, children, blink }: { tono: Tono; children: React.ReactNode; blink?: boolean }) {
  const prioridad = PRIORIDAD[tono]
  const neutro = tono === 'off' || tono === 'fds'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border border-border text-[11px] font-bold tracking-wider whitespace-nowrap ${neutro ? 'text-muted-foreground' : 'text-foreground'}`}>
      {prioridad && <span className="hlc-estado hlc-estado--chico"><SimboloEstado prioridad={prioridad} className={blink ? 'blink' : ''} /></span>}
      {children}
    </span>
  )
}

// Borde de la tarjeta: solo lo anormal (sin comunicación punteado, alarma en rojo)
export const bordeCampo = (live: boolean, alarma: boolean): React.CSSProperties | undefined =>
  !live ? { borderColor: 'var(--st-com)', borderStyle: 'dashed' } : alarma ? { borderColor: 'var(--p1)', borderWidth: 2 } : undefined

// Señal libre por nombre (regex), o null si el mapa no la tiene
export const senalDe = (st: CampoState | undefined, re: RegExp): boolean | null => {
  const e = Object.entries(st?.senales ?? {}).find(([n]) => re.test(n))
  return e ? !!e[1] : null
}
export const medDe = (st: CampoState | undefined, re: RegExp): number | null => {
  const e = Object.entries(st?.extras ?? {}).find(([n]) => re.test(n))
  return e && typeof e[1] === 'number' && isFinite(e[1]) ? e[1] : null
}
