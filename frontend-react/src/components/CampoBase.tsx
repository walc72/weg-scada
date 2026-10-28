import { Badge } from './ui/badge'
import { SinEnlaceBadge } from './SinEnlaceBadge'
import type { CampoState } from '../types'
import { PowerOff, CheckCircle, AlertTriangle } from 'lucide-react'

// Valor numérico o «—» si falta / es null
export const fmt = (v: number | boolean | null | undefined, dec = 0, unit = ''): string =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(dec)}${unit ? ' ' + unit : ''}` : '—'

// Insignia de conexión común a ambas tarjetas
export function EstadoConexion({ st }: { st?: CampoState }) {
  if (st?.license === 'excedido') {
    return <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold shrink-0"><PowerOff className="h-3 w-3" /> Fuera de licencia</Badge>
  }
  if (!st) return <Badge variant="secondary" className="px-3 py-1 text-xs font-bold shrink-0">Esperando lectura</Badge>
  if (st.online) return <Badge variant="success" className="gap-1 px-3 py-1 text-xs font-bold shrink-0"><CheckCircle className="h-3 w-3" /> ONLINE</Badge>
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
