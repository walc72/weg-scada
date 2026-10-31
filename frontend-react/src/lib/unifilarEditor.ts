// Ayudas puras del editor del unifilar (spec §4): historial, nodos nuevos, copiar/pegar, limpieza.
import type { Edge, Node } from '@xyflow/react'
import { S } from './bornes'
import { aFlow, escalable, puntosDe } from './unifilar'
import type { Conexion, Dibujo, Mostrar, Nodo, Unifilar } from './unifilar'
import type { AppConfig } from '../types'

// --- Deshacer / rehacer (50 pasos) ---
export const MAX_PASOS = 50
export interface Historial<T> { pasado: T[]; futuro: T[] }
export const historialVacio = <T,>(): Historial<T> => ({ pasado: [], futuro: [] })

// Guarda `actual` como paso a deshacer; una edición nueva borra lo rehacible
export const registrar = <T,>(h: Historial<T>, actual: T): Historial<T> =>
  ({ pasado: [...h.pasado, actual].slice(-MAX_PASOS), futuro: [] })

export function deshacer<T>(h: Historial<T>, actual: T): { h: Historial<T>; estado: T } | null {
  if (!h.pasado.length) return null
  return { estado: h.pasado[h.pasado.length - 1], h: { pasado: h.pasado.slice(0, -1), futuro: [actual, ...h.futuro] } }
}

export function rehacer<T>(h: Historial<T>, actual: T): { h: Historial<T>; estado: T } | null {
  if (!h.futuro.length) return null
  return { estado: h.futuro[0], h: { pasado: [...h.pasado, actual].slice(-MAX_PASOS), futuro: h.futuro.slice(1) } }
}

// --- Ids y nodos nuevos ---
export function nuevoId(prefijo: string, usados: { id: string }[]): string {
  let max = 0
  const re = new RegExp(`^${prefijo}(\\d+)$`)
  for (const u of usados) { const m = re.exec(u.id); if (m) max = Math.max(max, +m[1]) }
  return `${prefijo}${max + 1}`
}

export const snap = (v: number, g = 10) => Math.round(v / g) * g

// Valor numérico confirmado de un campo: texto vacío/inválido = null; si no, ajustado a la grilla `paso` y a [min, max]
export function acotar(texto: string, min?: number, max?: number, paso?: number): number | null {
  const x = parseFloat(texto)
  if (!Number.isFinite(x)) return null
  let v = paso ? Math.round(x / paso) * paso : x
  if (min != null) v = Math.max(min, v)
  if (max != null) v = Math.min(max, v)
  return v
}

// Nodo nuevo con valores válidos; el equipo arranca en el primero de Configuración (si hay)
export function nuevoNodo(tipo: string, x: number, y: number, id: string, cfg: AppConfig | null, sitio = ''): Nodo {
  const b = { id, tipo, x: snap(x), y: snap(y), rot: 0 as const }
  const primero = (l?: { name: string }[]) => l?.[0]?.name ?? ''
  switch (tipo) {
    case 'reco': return { ...b, ref: primero(cfg?.reconectadores), mostrar: [] }
    case 'reg': return { ...b, ref: primero(cfg?.reguladores), mostrar: [] }
    case 'medidor': return { ...b, ref: primero(cfg?.meters), mostrar: [] }
    case 'bomba': return { ...b, ref: primero(cfg?.devices), mostrar: [] }
    case 'caudalimetro': return { ...b, ref: primero(cfg?.flowmeters) }
    case 'comm': return { ...b, ref: primero(cfg?.comms) }
    case 'fuente': return { ...b, nombre: 'Fuente' }
    case 'barra': return { ...b, largo: 120 }
    case 'trafo': return { ...b, nombre: 'Trafo' }
    case 'tc': return { ...b, nombre: 'TC', relacion: '' }
    case 'tp': return { ...b, nombre: 'TP', relacion: '' }
    case 'seccionador': case 'fusible': return { ...b, nombre: '', cerrado: true }
    case 'carga': return { ...b, nombre: 'Carga' }
    case 'entrada': return { ...b, nombre: 'Entrada' }
    case 'salida': return { ...b, nombre: 'Salida' }
    case 'texto': return { ...b, texto: 'Texto', tam: 16 }
    case 'recuadro': return { ...b, ancho: 200, alto: 120, titulo: '' }
    case 'sitio': return { ...b, dibujo: sitio }
    default: return b
  }
}

// --- Dibujo inicial desde Configuración: equipos agrupados por sitio, sin conexiones (las traza el usuario) ---
const CELDA = 160, FILA = 140, PAD = 20, TITULO = 30, SEP = 40

export function generarDesdeConfig(cfg: AppConfig): Nodo[] {
  const on = <T extends { enabled?: boolean }>(l?: T[]) => (l ?? []).filter(x => x.enabled !== false)
  const sitioDe = new Map(on(cfg.devices).map(d => [d.name, d.site || '']))
  type Eq = { tipo: string; ref?: string; banco?: string }
  const grupos = new Map<string, Eq[][]>()  // sitio → filas [medidores, bombas, caudalímetros]
  const poner = (sitio: string, fila: number, e: Eq) => {
    if (!grupos.has(sitio)) grupos.set(sitio, [[], [], []])
    grupos.get(sitio)![fila].push(e)
  }
  for (const m of on(cfg.meters)) poner(m.site || '', 0, { tipo: 'medidor', ref: m.name })
  for (const d of on(cfg.devices)) poner(d.site || '', 1, { tipo: 'bomba', ref: d.name })
  for (const q of on(cfg.flowmeters)) poner(sitioDe.get(q.bombas?.[0] ?? '') ?? '', 2, { tipo: 'caudalimetro', ref: q.name })
  const cajas = [...grupos].filter(([s]) => s)
  if (grupos.has('')) cajas.push(['Sin sitio', grupos.get('')!])
  const regs = on(cfg.reguladores)
  const regEqs: Eq[] = [
    ...[...new Set(regs.filter(r => r.banco).map(r => r.banco!))].map(banco => ({ tipo: 'reg', banco })),
    ...regs.filter(r => !r.banco).map(r => ({ tipo: 'reg', ref: r.name })),
  ]
  if (regEqs.length) cajas.push(['Reguladores', [regEqs]])

  const nodos: Nodo[] = []
  const id = () => `n${nodos.length + 1}`
  const equipo = (e: Eq, x: number, y: number) => {
    const n = nuevoNodo(e.tipo, x, y, id(), null)
    delete n.ref
    nodos.push({ ...n, ...(e.banco != null ? { banco: e.banco } : { ref: e.ref }) })
  }
  const recos = on(cfg.reconectadores)
  recos.forEach((r, i) => equipo({ tipo: 'reco', ref: r.name }, i * CELDA, 0))
  const y0 = recos.length ? FILA + SEP : 0
  let x = 0
  for (const [titulo, filas] of cajas) {
    const llenas = filas.filter(f => f.length)
    const ancho = 2 * PAD + Math.max(...llenas.map(f => f.length)) * CELDA
    nodos.push({ ...nuevoNodo('recuadro', x, y0, id(), null), ancho, alto: TITULO + llenas.length * FILA + PAD, titulo })
    llenas.forEach((f, r) => f.forEach((e, i) => equipo(e, x + PAD + i * CELDA, y0 + TITULO + r * FILA)))
    x += ancho + SEP
  }
  return nodos
}

// --- Conversión con el lienzo conservando selección y medidas ya calculadas ---
export function fusionar(prevN: Node[], prevE: Edge[], d: Dibujo, sel?: Set<string>) {
  const pn = new Map(prevN.map(n => [n.id, n])), pe = new Map(prevE.map(e => [e.id, e]))
  const { nodes, edges } = aFlow(d)
  return {
    nodes: nodes.map(n => {
      const o = pn.get(n.id)
      return {
        ...n, ...(n.type === 'recuadro' ? { zIndex: -1 } : {}), ...(o ? { measured: o.measured } : {}),
        selected: sel ? sel.has(n.id) : !!o?.selected,
      } as Node
    }),
    edges: edges.map(e => ({ ...e, type: 'orto', selected: sel ? false : !!pe.get(e.id)?.selected }) as Edge),
  }
}

// --- Ediciones sobre un dibujo ---
export function borrar(d: Dibujo, nodos: Set<string>, conexiones: Set<string>): Dibujo {
  return {
    ...d,
    nodos: d.nodos.filter(n => !nodos.has(n.id)),
    conexiones: d.conexiones.filter(c => !conexiones.has(c.id) && !nodos.has(c.desde[0]) && !nodos.has(c.hasta[0])),
  }
}

// Pega copias con ids nuevos (y las conexiones que quedaron entre ellas); devuelve los ids nuevos
export function pegar(d: Dibujo, nodos: Nodo[], conexiones: Conexion[], delta = 20): { dibujo: Dibujo; nuevos: string[] } {
  const mapa = new Map<string, string>()
  const usados: { id: string }[] = [...d.nodos]
  for (const n of nodos) { const id = nuevoId('n', usados); usados.push({ id }); mapa.set(n.id, id) }
  const copias = nodos.map(n => ({ ...structuredClone(n), id: mapa.get(n.id)!, x: n.x + delta, y: n.y + delta }))
  const cons = [...d.conexiones]
  for (const c of conexiones) {
    const a = mapa.get(c.desde[0]), b = mapa.get(c.hasta[0])
    if (a && b) cons.push({ id: nuevoId('c', cons), desde: [a, c.desde[1]], hasta: [b, c.hasta[1]] })
  }
  return { dibujo: { ...d, nodos: [...d.nodos, ...copias], conexiones: cons }, nuevos: copias.map(n => n.id) }
}

// Tamaño nuevo desde las manijas (rect que propone React Flow; ini = rect al empezar): el símbolo toma la
// escala más cercana (0,5 a 3, pasos de 0,25) y el recuadro ancho/alto en grilla de 10. La esquina opuesta
// a la manija queda fija.
export interface Rect { x: number; y: number; width: number; height: number }
export function redimensionar(n: Nodo, p: Rect, ini: Rect): Nodo {
  let w: number, h: number, r: Nodo
  if (n.tipo === 'recuadro') {
    w = Math.max(40, snap(p.width)); h = Math.max(30, snap(p.height))
    r = { ...n, ancho: w, alto: h }
  } else if (escalable(n.tipo)) {
    const e = Math.min(3, Math.max(0.5, Math.round(p.width / S * 4) / 4))
    w = h = S * e
    const { escala: _e, ...sin } = n
    r = e === 1 ? sin : { ...sin, escala: e }
  } else return n
  return { ...r, x: Math.round(p.x !== ini.x ? ini.x + ini.width - w : ini.x), y: Math.round(p.y !== ini.y ? ini.y + ini.height - h : ini.y) }
}

// Alinear o repartir los nodos elegidos (tam = medida de cada uno en el lienzo). Alinear toma el borde
// o centro del grupo; distribuir (3 o más) deja los extremos y reparte parejo el espacio entre bordes.
export type Alineacion = 'izquierda' | 'centroH' | 'derecha' | 'arriba' | 'centroV' | 'abajo' | 'distribuirH' | 'distribuirV'
export function alinear(d: Dibujo, ids: Set<string>, modo: Alineacion, tam: Map<string, { w: number; h: number }>): Dibujo {
  const sel = d.nodos.filter(n => ids.has(n.id) && tam.has(n.id))
  if (sel.length < 2 || (modo.startsWith('distribuir') && sel.length < 3)) return d
  const horiz = ['izquierda', 'centroH', 'derecha', 'distribuirH'].includes(modo)
  const p = (n: Nodo) => (horiz ? n.x : n.y), l = (n: Nodo) => (horiz ? tam.get(n.id)!.w : tam.get(n.id)!.h)
  const nuevo = new Map<string, number>()
  if (modo.startsWith('distribuir')) {
    const orden = [...sel].sort((a, b) => p(a) + l(a) / 2 - (p(b) + l(b) / 2))
    const ini = p(orden[0]), fin = p(orden.at(-1)!) + l(orden.at(-1)!)
    const hueco = (fin - ini - orden.reduce((t, n) => t + l(n), 0)) / (orden.length - 1)
    let c = ini
    for (const n of orden) { nuevo.set(n.id, Math.round(c)); c += l(n) + hueco }
  } else {
    const min = Math.min(...sel.map(p)), max = Math.max(...sel.map(n => p(n) + l(n)))
    for (const n of sel) {
      const v = modo === 'izquierda' || modo === 'arriba' ? min : modo === 'derecha' || modo === 'abajo' ? max - l(n) : (min + max) / 2 - l(n) / 2
      nuevo.set(n.id, Math.round(v))
    }
  }
  if (sel.every(n => nuevo.get(n.id) === p(n))) return d
  return { ...d, nodos: d.nodos.map(n => (nuevo.has(n.id) ? (horiz ? { ...n, x: nuevo.get(n.id)! } : { ...n, y: nuevo.get(n.id)! }) : n)) }
}

// Estira (o acorta) una barra: p0 queda fija; las conexiones a puntos que ya no existen se sueltan
export function estirarBarra(d: Dibujo, id: string, largo: number): Dibujo {
  const n = d.nodos.find(x => x.id === id)
  const nuevo = Math.min(2000, Math.max(40, snap(largo)))
  if (!n || n.tipo !== 'barra' || n.largo === nuevo) return d
  const dl = nuevo - (n.largo ?? 40)
  const puntos = new Set(puntosDe({ tipo: 'barra', largo: nuevo }))
  return {
    ...d,
    nodos: d.nodos.map(x => x.id !== id ? x : { ...x, largo: nuevo, x: n.rot === 180 ? n.x - dl : n.x, y: n.rot === 270 ? n.y - dl : n.y }),
    conexiones: d.conexiones.filter(c => (c.desde[0] !== id || puntos.has(c.desde[1])) && (c.hasta[0] !== id || puntos.has(c.hasta[1]))),
  }
}

// Deja el archivo coherente tras borrar/renombrar: conexiones a nodos o puntos inexistentes,
// bloques de sitio sin dibujo y fuentes `desde` un nodo del general que ya no existe
export function limpiar(u: Unifilar): Unifilar {
  const sitios = new Set(u.dibujos.filter(d => d.tipo === 'sitio').map(d => d.id))
  const enGeneral = new Set(u.dibujos.find(d => d.tipo === 'general')?.nodos.map(n => n.id))
  let cambio = false
  const dibujos = u.dibujos.map(d => {
    let c = false
    const nodos = d.nodos.filter(n => !(n.tipo === 'sitio' && !sitios.has(n.dibujo ?? ''))).map(n => {
      const v = n.vinculo
      if (n.tipo === 'fuente' && v && 'desde' in v && (d.tipo !== 'sitio' || !enGeneral.has(v.desde))) {
        const { vinculo: _v, ...resto } = n; c = true; return resto as Nodo
      }
      return n
    })
    if (nodos.length !== d.nodos.length) c = true
    const porId = new Map(nodos.map(n => [n.id, n]))
    const ok = (e: [string, string]) => { const n = porId.get(e[0]); return !!n && puntosDe(n).includes(e[1]) }
    const conexiones = d.conexiones.filter(x => ok(x.desde) && ok(x.hasta) && x.desde[0] !== x.hasta[0])
    if (conexiones.length !== d.conexiones.length) c = true
    if (!c) return d
    cambio = true
    return { ...d, nodos, conexiones }
  })
  return cambio ? { ...u, dibujos } : u
}

// --- mostrar ---
export const claveMostrar = (m: Mostrar) => typeof m === 'string' ? m : 'med' in m ? `m:${m.med}` : `s:${m.senal}`
export const tieneMostrar = (n: Nodo, m: Mostrar) => !!n.mostrar?.some(x => claveMostrar(x) === claveMostrar(m))
export const alternarMostrar = (n: Nodo, m: Mostrar): Nodo => ({
  ...n,
  mostrar: tieneMostrar(n, m) ? n.mostrar!.filter(x => claveMostrar(x) !== claveMostrar(m)) : [...(n.mostrar ?? []), m],
})
