// Catálogo de gadgets del Dashboard y saneo del layout (puro, sin React ni store).

export type Ancho = 4 | 6 | 8 | 12 // columnas de una grilla de 12 (S, M, L, XL)
export type TipoGadget = 'alarmas' | 'kpis' | 'bombas' | 'medidor' | 'generadores' | 'tendencia' | 'misGrafico'
export type ItemGadget = { id: string; tipo: TipoGadget; ancho: Ancho; opciones?: Record<string, unknown> }
export type Layout = { v: 1; items: ItemGadget[] }

export const KPI_IDS = ['motores', 'potencia', 'caudal', 'energia', 'kwhL', 'frecuencia', 'perdida'] as const

export type CtxGadgets = {
  hasModule: (m: string) => boolean
  medidores: string[]
  sitios: string[] // nombres de sitio (sin el grupo null)
  graficos: string[]
}

type Entrada = {
  titulo: string
  anchos: Ancho[]
  anchoDefecto: Ancho
  modulo?: string
  multiple: boolean
  sanear: (o: unknown, ctx: CtxGadgets) => Record<string, unknown>
}

const obj = (o: unknown): Record<string, unknown> =>
  o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {}

export const CATALOGO: Record<TipoGadget, Entrada> = {
  alarmas: { titulo: 'ALARMAS ACTIVAS', anchos: [12], anchoDefecto: 12, multiple: false, sanear: () => ({}) },
  kpis: {
    titulo: 'INDICADORES',
    anchos: [6, 8, 12],
    anchoDefecto: 12,
    multiple: false,
    sanear: (o) => {
      const oc = obj(o).ocultos
      const ocultos = Array.isArray(oc) ? KPI_IDS.filter((k) => oc.includes(k)) : []
      return { ocultos }
    },
  },
  bombas: {
    titulo: 'BOMBAS POR SITIO',
    anchos: [6, 8, 12],
    anchoDefecto: 8,
    multiple: false,
    sanear: (o, ctx) => {
      const s = obj(o).sitios
      const sitios = Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string' && ctx.sitios.includes(x)) : []
      return { sitios: sitios.length ? sitios : null }
    },
  },
  medidor: {
    titulo: 'MEDIDOR',
    anchos: [4, 6, 8],
    anchoDefecto: 4,
    modulo: 'medidores',
    multiple: true,
    sanear: (o, ctx) => {
      const m = obj(o).medidor
      return { medidor: typeof m === 'string' && ctx.medidores.includes(m) ? m : null }
    },
  },
  generadores: {
    titulo: 'GENERADORES',
    anchos: [4, 6, 8, 12],
    anchoDefecto: 6,
    modulo: 'generadores',
    multiple: false,
    sanear: () => ({}),
  },
  tendencia: {
    titulo: 'TENDENCIA',
    anchos: [6, 8, 12],
    anchoDefecto: 6,
    multiple: true,
    sanear: (o, ctx) => {
      const { magnitud, ventanaH } = obj(o)
      return {
        magnitud: magnitud === 'caudal' && ctx.hasModule('caudales') ? 'caudal' : 'potencia',
        ventanaH: ventanaH === 6 || ventanaH === 24 ? ventanaH : 1,
      }
    },
  },
  misGrafico: {
    titulo: 'MIS GRÁFICOS',
    anchos: [6, 8, 12],
    anchoDefecto: 6,
    multiple: true,
    // se conserva el id aunque ya no exista: el gadget avisa «Este gráfico ya no existe.»
    sanear: (o) => {
      const g = obj(o).grafico
      return { grafico: typeof g === 'string' ? g : '' }
    },
  },
}

export const DEFECTO_CODIGO: Layout = {
  v: 1,
  items: [
    { id: 'alarmas', tipo: 'alarmas', ancho: 12 },
    { id: 'kpis', tipo: 'kpis', ancho: 12 },
    { id: 'bombas', tipo: 'bombas', ancho: 8 },
    { id: 'medidor', tipo: 'medidor', ancho: 4 },
  ],
}

const idNuevo = (tipo: string) => `${tipo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function nuevoItem(tipo: TipoGadget): ItemGadget {
  const c = CATALOGO[tipo]
  // ctx vacío a propósito: solo queremos los valores por defecto de las opciones
  return { id: idNuevo(tipo), tipo, ancho: c.anchoDefecto, opciones: c.sanear(undefined, { hasModule: () => false, medidores: [], sitios: [], graficos: [] }) }
}

export function sanearLayout(l: unknown, ctx: CtxGadgets): Layout {
  const raw = obj(l)
  const items: ItemGadget[] = []
  if (raw.v !== 1 || !Array.isArray(raw.items)) return { v: 1, items }
  const ids = new Set<string>()
  const tipos = new Set<string>()
  for (const x of raw.items) {
    const it = obj(x)
    const tipo = it.tipo as TipoGadget
    if (typeof tipo !== 'string' || !Object.prototype.hasOwnProperty.call(CATALOGO, tipo)) continue
    const c = CATALOGO[tipo]
    if (c.modulo && !ctx.hasModule(c.modulo)) continue
    if (!c.multiple && tipos.has(tipo)) continue
    tipos.add(tipo)
    let id = typeof it.id === 'string' && it.id ? it.id : idNuevo(tipo)
    while (ids.has(id)) id = idNuevo(tipo)
    ids.add(id)
    const ancho = c.anchos.includes(it.ancho as Ancho) ? (it.ancho as Ancho) : c.anchoDefecto
    items.push({ id, tipo, ancho, opciones: c.sanear(it.opciones, ctx) })
  }
  return { v: 1, items }
}

// Un layout guardado malformado no debe dejar el Dashboard en blanco: cae al siguiente.
const valido = (l: unknown) => {
  const r = obj(l)
  return r.v === 1 && Array.isArray(r.items)
}

// Sitios configurados (no solo los que ya reportaron por MQTT)
export const sitiosConfig = (devices: readonly { site?: string }[]): string[] =>
  [...new Set(devices.map((d) => d.site?.trim()).filter(Boolean))] as string[]

// Los Mis gráficos son personales: no van en el predeterminado que ven los demás
export const paraPredeterminado = (l: Layout): Layout => ({ ...l, items: l.items.filter((x) => x.tipo !== 'misGrafico') })

export const layoutEfectivo = (usuario: Layout | null, defecto: Layout | null, ctx: CtxGadgets): Layout =>
  sanearLayout(valido(usuario) ? usuario : valido(defecto) ? defecto : DEFECTO_CODIGO, ctx)

export function moverA(l: Layout, desde: number, hasta: number): Layout {
  const n = l.items.length
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= n || hasta >= n) return l
  const items = [...l.items]
  items.splice(hasta, 0, items.splice(desde, 1)[0])
  return { ...l, items }
}

export function mover(l: Layout, id: string, delta: -1 | 1): Layout {
  const i = l.items.findIndex((x) => x.id === id)
  return i < 0 ? l : moverA(l, i, i + delta)
}

// Catálogo para «AGREGAR GADGET»: sin licencia no aparecen; los no múltiples ya presentes (y Mis gráficos sin gráficos), deshabilitados
export const disponiblesParaAgregar = (l: Layout, ctx: CtxGadgets): { tipo: TipoGadget; deshabilitado: boolean }[] =>
  (Object.keys(CATALOGO) as TipoGadget[])
    .filter((tipo) => !CATALOGO[tipo].modulo || ctx.hasModule(CATALOGO[tipo].modulo!))
    .map((tipo) => ({
      tipo,
      deshabilitado: (!CATALOGO[tipo].multiple && l.items.some((x) => x.tipo === tipo)) || (tipo === 'misGrafico' && ctx.graficos.length === 0),
    }))

// Arrastre con teclado: id vecino en el orden actual según la flecha (null en los extremos o si no corresponde)
export function vecinoPorTecla(ids: readonly string[], actual: string, code: string): string | null {
  const d = code === 'ArrowRight' || code === 'ArrowDown' ? 1 : code === 'ArrowLeft' || code === 'ArrowUp' ? -1 : 0
  const i = ids.indexOf(actual)
  return d && i >= 0 ? (ids[i + d] ?? null) : null
}
