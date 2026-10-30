import { createContext, useContext } from 'react'
import type { Estado, Resultado, Vivos } from '../../lib/energizar'
import type { Dibujo, Unifilar } from '../../lib/unifilar'

// Lo que ven los nodos del lienzo: datos en vivo, estado energizado y colores del archivo
export interface CtxUnifilar {
  vivos: Vivos
  res: Resultado
  colores: NonNullable<Unifilar['colores']>
  dibujos: Dibujo[]
  resultados: Map<string, Resultado> // por dibujo (resumen del bloque sitio)
  editando?: boolean // modo edición: puntos de conexión activos y tirador de barra
  onBarra?: (id: string, largo: number, inicio: boolean) => void // estirar una barra (inicio = abre un paso de deshacer)
}

export const UnifilarCtx = createContext<CtxUnifilar | null>(null)
export const useUnifilar = () => {
  const c = useContext(UnifilarCtx)
  if (!c) throw new Error('UnifilarCtx ausente')
  return c
}

export const GRIS = 'hsl(var(--muted-foreground))'
export const AMBAR = '#f59e0b'
// Conexión de medición (TC/TP → medidor): fina, punteada y neutra; no muestra tensión
export const ESTILO_MEDICION = { stroke: '#64748b', strokeWidth: 1.5, strokeDasharray: '3 3' }
export const esPuntoMedicion = (h?: string | null) => h === 's' || h === 'm'
const VERDE = '#22c55e', ROJO = '#ef4444'

// Color de línea/símbolo por estado (spec §3.2); desconocido siempre ámbar punteado
export function colorDe(e: Estado, colores: CtxUnifilar['colores']): { stroke: string; dash?: string } {
  if (e === 'desconocido') return { stroke: AMBAR, dash: '6 4' }
  const vivo = e === 'energizado'
  return { stroke: colores === 'ansi' ? (vivo ? ROJO : VERDE) : (vivo ? VERDE : GRIS) }
}
