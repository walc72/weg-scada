import React from 'react'
import { crearSimboloReact, type Prioridad, type Variante } from '../marca/hecian-estados.js'

// Símbolos de estado unificados HECIAN LC (src/marca/hecian-estados.*): alta = cuadrado «1», media = triángulo «2»,
// baja = rombo «3», invalido = círculo «?» (sin comunicación, dato viejo), suprimida y fuera de servicio en gris.
// Lo normal (en marcha, en línea) no lleva símbolo ni color.
export const SimboloEstado = crearSimboloReact(React)
export type { Prioridad, Variante }

const TAMANO = { chico: 'hlc-estado--chico', normal: '', grande: 'hlc-estado--grande' } as const

// Símbolo + texto al lado. chico = 12 px (tablas densas), normal = 16 px (listas y banda), grande = 20 px (fichas)
export function Estado({ prioridad, variante, tamano = 'normal', blink, className = '', children }: {
  prioridad: Prioridad; variante?: Variante; tamano?: keyof typeof TAMANO; blink?: boolean; className?: string; children?: React.ReactNode
}) {
  return (
    <span className={`hlc-estado ${TAMANO[tamano]} ${className}`.trim()}>
      <SimboloEstado prioridad={prioridad} variante={variante} className={blink ? 'blink' : ''} />
      {children}
    </span>
  )
}
