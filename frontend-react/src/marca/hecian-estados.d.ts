// Tipos de src/marca/hecian-estados.js (copia sin cambios del repo de marca, estados/). No editar el .js.
import type * as ReactNS from 'react'

export type Prioridad = 'alta' | 'media' | 'baja' | 'invalido' | 'suprimida' | 'fuera-de-servicio'
export type Variante = 'sin-reconocer' | 'reconocida' | 'normalizada'

export interface Simbolo { etiqueta: string; cuerpo: string }
export const SIMBOLOS: Record<string, Simbolo>

export function idEstado(prioridad: Prioridad, variante?: Variante): string
export function simboloEstado(prioridad: Prioridad, variante?: Variante, opciones?: { tamano?: number; titulo?: string }): string

export interface SimboloEstadoProps extends Omit<ReactNS.SVGProps<SVGSVGElement>, 'children'> {
  prioridad: Prioridad
  variante?: Variante
  tamano?: number
  titulo?: string
  className?: string
}
export function crearSimboloReact(React: typeof ReactNS): (props: SimboloEstadoProps) => ReactNS.ReactElement | null
