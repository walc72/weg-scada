// Archivo del unifilar (config/unifilar.json, spec 2026-10-29) y su conversión al formato de React Flow.
// Funciones puras: sin React ni stores.

export type Rot = 0 | 90 | 180 | 270
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
    case 'reco': case 'reg': case 'medidor': case 'trafo': case 'seccionador': case 'fusible': return ['a', 'b']
    case 'bomba': case 'fuente': case 'carga': return ['a']
    case 'barra': {
      if (!Number.isInteger(n.largo) || (n.largo as number) < 20) return []
      return Array.from({ length: Math.floor((n.largo as number) / 20) + 1 }, (_, i) => `p${i}`)
    }
    default: return []
  }
}

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
