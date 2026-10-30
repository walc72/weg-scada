// Bornes (puntos de conexión) de un símbolo de 48 px: posición según su lado, elegible por punto
// (n.lados, relativo al símbolo sin girar: el giro del nodo los lleva con él). Función pura.
import { puntosDe } from './unifilar'
import type { Lado, Nodo } from './unifilar'

export const S = 48
export interface Borne { id: string; lado: Lado; x: number; y: number; dx: number; dy: number; movido: boolean }

export function ladoPorDefecto(n: Pick<Nodo, 'tipo'>, id: string): Lado {
  if (id === 's' || id === 'm') return 'derecha'
  if (id === 'd') return n.tipo === 'comm' ? 'abajo' : 'izquierda'
  return id === 'b' || n.tipo === 'fuente' ? 'abajo' : 'arriba'
}

const POS: Record<Lado, Omit<Borne, 'id' | 'lado' | 'movido'>> = {
  arriba: { x: S / 2, y: 0, dx: 0, dy: -1 },
  abajo: { x: S / 2, y: S, dx: 0, dy: 1 },
  izquierda: { x: 0, y: S / 2, dx: -1, dy: 0 },
  derecha: { x: S, y: S / 2, dx: 1, dy: 0 },
}

export function bornes(n: Nodo): Borne[] {
  if (n.tipo === 'barra') return puntosDe(n).map((id, i) => ({ id, lado: 'abajo', x: i * 20, y: 5, dx: 0, dy: 1, movido: false }))
  return puntosDe(n).map(id => {
    const def = ladoPorDefecto(n, id), lado = n.lados?.[id] ?? def
    return { id, lado, ...POS[lado], movido: lado !== def }
  })
}

// Tramo corto del símbolo hasta un borne movido (en el color del punto)
export const tramoCorto = (l: Lado) => ({ arriba: 'M24 0V10', abajo: 'M24 38V48', izquierda: 'M0 24H10', derecha: 'M38 24H48' })[l]
