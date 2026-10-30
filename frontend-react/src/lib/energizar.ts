// Energización del unifilar en vivo (spec §3.1, §3.3, §3.4). Función pura: sin React ni stores.
import type { AppConfig, CampoConfig, CampoState, CommState, Drive, FlowmeterState, Meter } from '../types'
import { isStale } from './stale'
import { recoCerrado } from './reco'
import { esDatos, esMedicion, puntosDe } from './unifilar'
import type { Conexion, Dibujo, Nodo, Unifilar } from './unifilar'

export type Estado = 'energizado' | 'sinTension' | 'desconocido'

export interface Vivos {
  campo: Map<string, CampoState>
  meters: Map<string, Meter>
  drives: Map<string, Drive>
  flowmeters: Map<string, FlowmeterState>
  comms: Map<string, CommState>
  config: AppConfig
  ahora: number     // ms epoch
}

export interface Resultado {
  tramos: Map<string, Estado>
  nodos: Map<string, Estado>
  puntos: Map<string, Estado>  // "nodo:punto"
  sentido: Map<string, 1 | -1>  // tramo energizado: 1 = de desde a hasta, -1 = al revés
}

export interface EstadoEquipo { online: 'si' | 'no' | 'parcial'; alarmas: string[]; sinEnlace?: string; faltante?: true }

// Reguladores habilitados de un banco, en el orden de la lista
export function fasesDeBanco(config: AppConfig, banco: string): CampoConfig[] {
  return (config.reguladores || []).filter(r => r.banco === banco && r.enabled !== false)
}

type Comunica = { online: boolean; license?: string; sinEnlace?: string; pollMs?: number }

// El poller publica weg/comm/* cada 30 s y sin pollMs
export const CICLO_COMM = 30000

// En línea de verdad: online, dentro de licencia, sin enlace caído y dato fresco
// (hora de llegada `_ts`, mismo criterio que las tarjetas: isStale con el pollMs del equipo)
const vivo = (s: Comunica | undefined, ts: number | undefined, v: Vivos, pollMs = s?.pollMs) =>
  !!s && s.online && s.license !== 'excedido' && !s.sinEnlace && !isStale(ts, v.ahora, pollMs)

const campoVivo = (s: CampoState | undefined, v: Vivos): s is CampoState => vivo(s, s?._ts, v)

function fasesVivas(banco: string, v: Vivos): CampoState[] {
  return fasesDeBanco(v.config, banco).map(f => v.campo.get(f.name)).filter((s): s is CampoState => campoVivo(s, v))
}

export function estadoEquipo(n: Nodo, v: Vivos): EstadoEquipo {
  const falta: EstadoEquipo = { online: 'no', alarmas: [], faltante: true }
  const simple = (s: Comunica | undefined, ts: number | undefined, alarmas: string[]): EstadoEquipo =>
    !s ? falta : { online: vivo(s, ts, v) ? 'si' : 'no', alarmas, ...(s.sinEnlace ? { sinEnlace: s.sinEnlace } : {}) }
  switch (n.tipo) {
    case 'reco': case 'reg': {
      if (n.tipo === 'reg' && n.banco != null) {
        const fases = fasesDeBanco(v.config, n.banco).map(f => v.campo.get(f.name))
        if (!fases.length) return falta
        const vivas = fases.filter((s): s is CampoState => campoVivo(s, v))
        const alarmas = [...new Set(vivas.flatMap(s => Object.values(s.alarmas)))]
        const sinEnlace = vivas.length ? undefined : fases.find(s => s?.sinEnlace)?.sinEnlace
        return {
          online: vivas.length === 0 ? 'no' : vivas.length === fases.length ? 'si' : 'parcial',
          alarmas, ...(sinEnlace ? { sinEnlace } : {}),
        }
      }
      const s = v.campo.get(n.ref ?? '')
      return simple(s, s?._ts, Object.values(s?.alarmas ?? {}))
    }
    case 'medidor': { const m = v.meters.get(n.ref ?? ''); return simple(m, m?._ts, []) }
    case 'bomba': {
      const d = v.drives.get(n.ref ?? '')
      return simple(d, d?._ts, d ? [...(d.fault || d.hasFault ? ['Falla'] : []), ...(d.hasAlarm ? ['Alarma'] : [])] : [])
    }
    case 'caudalimetro': { const f = v.flowmeters.get(n.ref ?? ''); return simple(f, f?.ts, []) }
    case 'comm': {
      const c = v.comms.get(n.ref ?? '') as (CommState & Comunica) | undefined
      return !c ? falta : { online: vivo(c, c._ts, v, c.pollMs ?? CICLO_COMM) ? 'si' : 'no', alarmas: [], ...(c.sinEnlace ? { sinEnlace: c.sinEnlace } : {}) }
    }
    default: return { online: 'si', alarmas: [] }
  }
}

const RANK: Record<Estado, number> = { energizado: 2, desconocido: 1, sinTension: 0 }

// Estado aguas abajo de un nodo del general: el de su punto peor rankeado
// (en un dispositivo de 2 puntos, un reco abierto con línea viva deja b sin tensión)
function estadoAbajo(id: string, r?: Resultado): Estado {
  if (!r) return 'desconocido'
  let peor: Estado | undefined
  for (const [k, e] of r.puntos) if (k.startsWith(`${id}:`) && !/:[smd]$/.test(k) && (!peor || RANK[e] < RANK[peor])) peor = e  // solo puntos de potencia
  return peor ?? r.nodos.get(id) ?? 'desconocido'
}

// Estado de una fuente (§3.3)
function estadoFuente(n: Nodo, v: Vivos, general?: { resultado: Resultado }): Estado {
  const vin = n.vinculo
  if (!vin) return 'energizado'
  if ('desde' in vin) return estadoAbajo(vin.desde, general?.resultado)
  const umbral = vin.nominal * (vin.umbralPct ?? 50) / 100
  const tension = (s: CampoState): number | null => {
    const x = vin.med ? s.extras?.[vin.med] : s.valores.v
    return typeof x === 'number' ? x : null
  }
  let vs: Array<number | null>
  if (vin.banco != null) vs = fasesVivas(vin.banco, v).map(tension)
  else if (vin.kind === 'medidor') {
    const m = v.meters.get(vin.ref ?? '')
    vs = m && vivo(m, m._ts, v) ? [m.voltage] : []
  } else {
    const s = v.campo.get(vin.ref ?? '')
    vs = campoVivo(s, v) ? [tension(s)] : []
  }
  const datos = vs.filter((x): x is number => x != null && Number.isFinite(x))
  if (!datos.length) return 'desconocido'
  return datos.some(x => x >= umbral) ? 'energizado' : 'sinTension'
}

// ¿Une a con b por dentro? 'si' | 'no' | 'desc' (propaga desconocido)
function paso(n: Nodo, v: Vivos): 'si' | 'no' | 'desc' {
  switch (n.tipo) {
    case 'trafo': case 'medidor': case 'tc': return 'si'
    case 'reg': return 'si'  // regulador o banco, incluso con ref/banco inexistente: paso libre
    case 'seccionador': case 'fusible': return n.cerrado ? 'si' : 'no'
    case 'reco': {
      const s = v.campo.get(n.ref ?? '')
      if (!campoVivo(s, v)) return 'desc'
      const e = recoCerrado(s)
      return e === 'cerrado' ? 'si' : e === null ? 'desc' : 'no'
    }
    default: return 'no'
  }
}

export function energizar(d: Dibujo, v: Vivos, general?: { dibujo: Dibujo; resultado: Resultado }): Resultado {
  const key = (n: string, p: string) => `${n}:${p}`
  const porId = new Map(d.nodos.map(n => [n.id, n]))
  // vecinos por cable
  const cable = new Map<string, string[]>()
  const unir = (a: string, b: string) => { const l = cable.get(a) ?? []; l.push(b); cable.set(a, l) }
  // las conexiones de medición (TC/TP → medidor) son cableado de medición: no llevan tensión
  const potencia = d.conexiones.filter(c => !esMedicion(c) && !esDatos(c))
  for (const c of potencia) {
    const a = key(c.desde[0], c.desde[1]), b = key(c.hasta[0], c.hasta[1])
    unir(a, b); unir(b, a)
  }
  // [punto vecino, ¿camino cierto?]
  const vecinos = (k: string): Array<[string, boolean]> => {
    const i = k.lastIndexOf(':'), n = porId.get(k.slice(0, i)), p = k.slice(i + 1)
    const out: Array<[string, boolean]> = (cable.get(k) ?? []).map(x => [x, true])
    if (!n) return out
    if (n.tipo === 'barra') puntosDe(n).forEach(q => { if (q !== p) out.push([key(n.id, q), true]) })
    else if ((p === 'a' || p === 'b') && puntosDe(n).includes('b')) {  // paso interno solo entre a y b
      const r = paso(n, v)
      if (r !== 'no') out.push([key(n.id, p === 'a' ? 'b' : 'a'), r === 'si'])
    }
    return out
  }
  // alcanzables desde las semillas, con su distancia (en saltos); con `incierto` también cruza lo desconocido
  const alcanzar = (semillas: string[], incierto: boolean): Map<string, number> => {
    const dist = new Map(semillas.map(s => [s, 0])), cola = [...semillas]
    for (let i = 0; i < cola.length; i++) {
      const k = cola[i]
      for (const [x, cierto] of vecinos(k)) {
        if ((cierto || incierto) && !dist.has(x)) { dist.set(x, dist.get(k)! + 1); cola.push(x) }
      }
    }
    return dist
  }

  const fuentes = d.nodos.filter(n => n.tipo === 'fuente').map(n => [key(n.id, 'a'), estadoFuente(n, v, general)] as const)
  const sem = (...e: Estado[]) => fuentes.filter(([, s]) => e.includes(s)).map(([k]) => k)
  const seguro = alcanzar(sem('energizado'), false)
  const posible = alcanzar(sem('energizado', 'desconocido'), true)
  const de = (k: string): Estado => seguro.has(k) ? 'energizado' : posible.has(k) ? 'desconocido' : 'sinTension'

  const puntos = new Map<string, Estado>()
  const nodos = new Map<string, Estado>()
  for (const n of d.nodos) {
    for (const p of puntosDe(n)) {
      const s = de(key(n.id, p))
      puntos.set(key(n.id, p), s)
      const prev = nodos.get(n.id)
      if (!prev || RANK[s] > RANK[prev]) nodos.set(n.id, s)
    }
  }
  const tramos = new Map<string, Estado>()
  const sentido = new Map<string, 1 | -1>()
  for (const c of potencia) {
    const a = key(c.desde[0], c.desde[1]), b = key(c.hasta[0], c.hasta[1])
    tramos.set(c.id, de(a))
    // el flujo va del extremo más cercano a la fuente al más lejano (empate, p. ej. en un anillo: sin sentido)
    const da = seguro.get(a), db = seguro.get(b)
    if (da != null && db != null && da !== db) sentido.set(c.id, da < db ? 1 : -1)
  }
  return { tramos, nodos, puntos, sentido }
}

// Energización de todos los dibujos: el general primero (los sitios pueden tomar estado de él)
export function energizarTodos(u: Unifilar, v: Vivos): Map<string, Resultado> {
  const m = new Map<string, Resultado>()
  const general = u.dibujos.find(d => d.tipo === 'general')
  const rg = general && energizar(general, v)
  if (general && rg) m.set(general.id, rg)
  for (const d of u.dibujos) if (d !== general) m.set(d.id, energizar(d, v, general && rg ? { dibujo: general, resultado: rg } : undefined))
  return m
}

// Resumen del bloque sitio (spec §3.6): energizado > desconocido > sin tensión; dibujo vacío = neutro
export function resumenEstado(res: Resultado): Estado | null {
  const todos = [...res.tramos.values(), ...res.nodos.values()]
  if (!todos.length) return null
  return todos.includes('energizado') ? 'energizado' : todos.includes('desconocido') ? 'desconocido' : 'sinTension'
}

// kW que salen por un tramo energizado: los del medidor aguas arriba o los de la bomba que alimenta
// (solo con dato vivo y mayor que cero)
export function kwSale(d: Dibujo, e: { source: string; target: string }, sentido: 1 | -1, v: Vivos): number | undefined {
  const nodo = (id: string) => d.nodos.find(n => n.id === id)
  const arriba = nodo(sentido === 1 ? e.source : e.target), abajo = nodo(sentido === 1 ? e.target : e.source)
  let kw: number | null | undefined
  if (arriba?.tipo === 'medidor') {
    const m = v.meters.get(arriba.ref ?? '')
    kw = m && vivo(m, m._ts, v) && m.power != null ? m.power / 1000 : null
  } else if (abajo?.tipo === 'bomba') {
    const b = v.drives.get(abajo.ref ?? '')
    kw = b && vivo(b, b._ts, v) ? b.power : null
  }
  return kw != null && Number.isFinite(kw) && kw > 0 ? kw : undefined
}

export const EQUIPOS = ['reco', 'reg', 'medidor', 'bomba', 'caudalimetro', 'comm']

// Novedades de un dibujo: equipos con alarma o sin comunicación (este no suma sus alarmas viejas);
// un bloque de sitio junta lo de su dibujo y lleva su id para navegar
export interface ItemAlarma { id: string; nombre: string; alarmas: string[]; sinCom: number; dibujo?: string; enlace?: string }

// Enlace de datos comm ↔ equipo: ok (los dos en línea), cortado (la comunicación anda pero el equipo
// no responde: cable roto/cortado) o desconocido (comm caído, otro enlace caído o equipo no configurado)
export type EstadoEnlace = 'ok' | 'cortado' | 'desconocido'
export function estadoEnlace(d: Dibujo, c: Conexion, v: Vivos): EstadoEnlace {
  const ext = [c.desde[0], c.hasta[0]].map(id => d.nodos.find(n => n.id === id))
  const radio = ext.find(n => n?.tipo === 'comm'), eq = ext.find(n => n && n.tipo !== 'comm')
  if (!radio || !eq) return 'desconocido'
  const s = v.comms.get(radio.ref ?? '')
  if (!vivo(s, s?._ts, v, CICLO_COMM)) return 'desconocido'
  const e = estadoEquipo(eq, v)
  if (e.faltante || e.sinEnlace) return 'desconocido'
  return e.online === 'no' ? 'cortado' : 'ok'
}

export function listaAlarmas(d: Dibujo, dibujos: Dibujo[], v: Vivos): ItemAlarma[] {
  const items: ItemAlarma[] = []
  for (const n of d.nodos) {
    if (EQUIPOS.includes(n.tipo)) {
      const e = estadoEquipo(n, v), sinCom = e.online === 'no' ? 1 : 0
      const alarmas = sinCom ? [] : e.alarmas
      if (sinCom || alarmas.length) items.push({ id: n.id, nombre: n.nombre || n.banco || n.ref || n.id, alarmas, sinCom })
    } else if (n.tipo === 'sitio') {
      const s = dibujos.find(x => x.id === n.dibujo)
      if (!s) continue
      const sub = listaAlarmas(s, [], v)
      const alarmas = sub.flatMap(i => i.alarmas), sinCom = sub.reduce((t, i) => t + i.sinCom, 0)
      if (sinCom || alarmas.length) items.push({ id: n.id, nombre: s.nombre, alarmas, sinCom, dibujo: s.id })
    }
  }
  for (const c of d.conexiones) {
    if (!esDatos(c) || estadoEnlace(d, c, v) !== 'cortado') continue
    const ext = [c.desde[0], c.hasta[0]].map(id => d.nodos.find(n => n.id === id)!)
    const radio = ext.find(n => n.tipo === 'comm')!, eq = ext.find(n => n.tipo !== 'comm')!
    items.push({ id: eq.id, nombre: `Enlace cortado: ${radio.ref} → ${eq.nombre || eq.banco || eq.ref}`, alarmas: ['Enlace cortado'], sinCom: 0, enlace: c.id })
  }
  return items
}
