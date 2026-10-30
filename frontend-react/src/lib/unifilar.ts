// Archivo del unifilar (config/unifilar.json, spec 2026-10-29) y su conversión al formato de React Flow.
// Funciones puras: sin React ni stores.
import type { AppConfig } from '../types'

export type Rot = 0 | 90 | 180 | 270
export type Lado = 'arriba' | 'abajo' | 'izquierda' | 'derecha'
export type Mostrar = string | { med: string } | { senal: string }
export type Vinculo =
  | { desde: string }
  | { ref?: string; banco?: string; kind: 'medidor' | 'reg'; med?: string; nominal: number; umbralPct?: number }

export interface Nodo {
  id: string
  tipo: string
  x: number
  y: number
  rot: Rot
  ref?: string
  banco?: string
  nombre?: string
  cerrado?: boolean
  largo?: number
  texto?: string
  tam?: number
  ancho?: number
  alto?: number
  titulo?: string
  dibujo?: string
  mostrar?: Mostrar[]
  vinculo?: Vinculo
  relacion?: string  // TC/TP: p. ej. «200/5 A»
  lados?: Record<string, Lado>  // lado de cada borne (relativo al símbolo sin girar)
  posTexto?: Lado | { dx: number; dy: number }  // nombre y mediciones: un lado o libre (px desde el centro)
}

export interface Conexion { id: string; desde: [string, string]; hasta: [string, string] }

export interface Dibujo {
  id: string
  nombre: string
  tipo: 'general' | 'sitio'
  nodos: Nodo[]
  conexiones: Conexion[]
}

export interface Unifilar { version: 1; colores?: 'portal' | 'ansi'; dibujos: Dibujo[] }

// Puntos de conexión de un nodo (igual que puntosDe de la API)
export function puntosDe(n: Pick<Nodo, 'tipo' | 'largo'>): string[] {
  switch (n.tipo) {
    case 'reco': case 'reg': return ['a', 'b', 'd']
    case 'trafo': case 'seccionador': case 'fusible': return ['a', 'b']
    case 'medidor': return ['a', 'b', 'm', 'd']
    case 'tc': return ['a', 'b', 's']
    case 'tp': return ['a', 's']
    case 'bomba': return ['a', 'd']
    case 'caudalimetro': case 'comm': return ['d']
    case 'fuente': case 'carga': return ['a']
    case 'barra': {
      if (!Number.isInteger(n.largo) || (n.largo as number) < 20) return []
      return Array.from({ length: Math.floor((n.largo as number) / 20) + 1 }, (_, i) => `p${i}`)
    }
    default: return []
  }
}

// Clases de punto (igual que la API): medición (secundario de TC/TP «s», entrada del medidor «m») solo s↔m;
// datos («d», enlace de comunicación) solo d↔d; el resto es potencia
const MEDICION = ['s', 'm']
const clase = (p: string) => (p === 'd' ? 'datos' : MEDICION.includes(p) ? 'medicion' : 'potencia')
export const conexionValida = (pa: string, pb: string) =>
  clase(pa) === clase(pb) && !(clase(pa) === 'medicion' && pa === pb)
export const esMedicion = (c: Conexion) => MEDICION.includes(c.desde[1])
export const esDatos = (c: Conexion) => c.desde[1] === 'd'

// Nodo de React Flow: el nodo completo del archivo va en data (la posición la mueve el lienzo)
export interface FlowNode { id: string; type: string; position: { x: number; y: number }; data: { nodo: Nodo } }
export interface FlowEdge { id: string; source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }

export function aFlow(d: Dibujo): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: d.nodos.map(n => ({ id: n.id, type: n.tipo, position: { x: n.x, y: n.y }, data: { nodo: n } })),
    edges: d.conexiones.map(c => ({
      id: c.id, source: c.desde[0], sourceHandle: c.desde[1], target: c.hasta[0], targetHandle: c.hasta[1],
    })),
  }
}

export function deFlow(d: Dibujo, nodes: FlowNode[], edges: FlowEdge[]): Dibujo {
  return {
    ...d,
    nodos: nodes.map(n => ({ ...n.data.nodo, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
    // una arista sin punto de conexión no es topología: se descarta
    conexiones: edges.flatMap((e): Conexion[] => e.sourceHandle && e.targetHandle
      ? [{ id: e.id, desde: [e.source, e.sourceHandle], hasta: [e.target, e.targetHandle] }] : []),
  }
}

// Dónde está dibujado un equipo (por nombre): el general primero, después los sitios en orden.
// Un regulador de un banco se ubica en el símbolo del banco.
export function ubicar(u: Unifilar, nombre: string, cfg: Pick<AppConfig, 'reguladores'>): { dibujo: string; nodo: string } | null {
  const banco = cfg.reguladores?.find(r => r.name === nombre && r.enabled !== false)?.banco
  const orden = [...u.dibujos.filter(d => d.tipo === 'general'), ...u.dibujos.filter(d => d.tipo !== 'general')]
  for (const d of orden) {
    const n = d.nodos.find(x => x.ref === nombre || (banco != null && x.banco === banco))
    if (n) return { dibujo: d.id, nodo: n.id }
  }
  return null
}
