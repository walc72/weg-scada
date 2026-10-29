// Energización del unifilar en vivo (spec §3.1, §3.3, §3.4). Función pura: sin React ni stores.
import type { AppConfig, CampoConfig, CampoState, CommState, Drive, FlowmeterState, Meter } from '../types'
import { puntosDe } from './unifilar'
import type { Dibujo, Nodo } from './unifilar'

export type Estado = 'energizado' | 'sinTension' | 'desconocido'

export interface Vivos {
  campo: Map<string, CampoState>
  meters: Map<string, Meter>
  drives: Map<string, Drive>
  flowmeters: Map<string, FlowmeterState>
  comms: Map<string, CommState>
  config: AppConfig
  ahora: number     // ms epoch
  cicloMs: number   // ciclo de poll (config.pollIntervalMs)
}

export interface Resultado {
  tramos: Map<string, Estado>
  nodos: Map<string, Estado>
  puntos: Map<string, Estado>  // "nodo:punto"
}

export interface EstadoEquipo { online: 'si' | 'no' | 'parcial'; alarmas: string[]; sinEnlace?: string; faltante?: true }

// Reguladores habilitados de un banco, en el orden de la lista
export function fasesDeBanco(config: AppConfig, banco: string): CampoConfig[] {
  return (config.reguladores || []).filter(r => r.banco === banco && r.enabled !== false)
}

// Dato con más de 3 ciclos de antigüedad (o sin marca de tiempo)
const viejo = (ts: number | undefined, v: Vivos) => ts == null || v.ahora - ts > 3 * v.cicloMs

type Comunica = { online: boolean; license?: string; sinEnlace?: string }

// En línea de verdad: online, dentro de licencia, sin enlace caído y dato fresco
const vivo = (s: Comunica | undefined, ts: number | undefined, v: Vivos) =>
  !!s && s.online && s.license !== 'excedido' && !s.sinEnlace && !viejo(ts, v)

const campoVivo = (s: CampoState | undefined, v: Vivos): s is CampoState => vivo(s, s?.ts, v)

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
        const alarmas = [...new Set(fases.flatMap(s => Object.keys(s?.alarmas ?? {})))]
        const sinEnlace = vivas.length ? undefined : fases.find(s => s?.sinEnlace)?.sinEnlace
        return {
          online: vivas.length === 0 ? 'no' : vivas.length === fases.length ? 'si' : 'parcial',
          alarmas, ...(sinEnlace ? { sinEnlace } : {}),
        }
      }
      const s = v.campo.get(n.ref ?? '')
      return simple(s, s?.ts, Object.keys(s?.alarmas ?? {}))
    }
    case 'medidor': { const m = v.meters.get(n.ref ?? ''); return simple(m, m?._ts, []) }
    case 'bomba': {
      const d = v.drives.get(n.ref ?? '')
      return simple(d, d?._ts, d ? [...(d.fault || d.hasFault ? ['Falla'] : []), ...(d.hasAlarm ? ['Alarma'] : [])] : [])
    }
    case 'caudalimetro': { const f = v.flowmeters.get(n.ref ?? ''); return simple(f, f?.ts, []) }
    case 'comm': { const c = v.comms.get(n.ref ?? ''); return c ? { online: c.online ? 'si' : 'no', alarmas: [] } : falta }
    default: return { online: 'si', alarmas: [] }
  }
}

// Estado de una fuente (§3.3)
function estadoFuente(n: Nodo, v: Vivos, general?: { resultado: Resultado }): Estado {
  const vin = n.vinculo
  if (!vin) return 'energizado'
  if ('desde' in vin) return general?.resultado.nodos.get(vin.desde) ?? 'desconocido'
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
    case 'trafo': case 'medidor': return 'si'
    case 'reg': return 'si'  // regulador o banco, incluso con ref/banco inexistente: paso libre
    case 'seccionador': case 'fusible': return n.cerrado ? 'si' : 'no'
    case 'reco': {
      const s = v.campo.get(n.ref ?? '')
      if (!campoVivo(s, v)) return 'desc'
      if (s.alarmas.DISPARO) return 'no'
      const e = s.valores.estado
      return e === 1 || e === true ? 'si' : e === 0 || e === false ? 'no' : 'desc'
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
  for (const c of d.conexiones) {
    const a = key(c.desde[0], c.desde[1]), b = key(c.hasta[0], c.hasta[1])
    unir(a, b); unir(b, a)
  }
  // [punto vecino, ¿camino cierto?]
  const vecinos = (k: string): Array<[string, boolean]> => {
    const i = k.lastIndexOf(':'), n = porId.get(k.slice(0, i)), p = k.slice(i + 1)
    const out: Array<[string, boolean]> = (cable.get(k) ?? []).map(x => [x, true])
    if (!n) return out
    if (n.tipo === 'barra') puntosDe(n).forEach(q => { if (q !== p) out.push([key(n.id, q), true]) })
    else if (puntosDe(n).length === 2) {
      const r = paso(n, v)
      if (r !== 'no') out.push([key(n.id, p === 'a' ? 'b' : 'a'), r === 'si'])
    }
    return out
  }
  // alcanzables desde las semillas; con `incierto` también cruza lo desconocido
  const alcanzar = (semillas: string[], incierto: boolean): Set<string> => {
    const vis = new Set(semillas), cola = [...semillas]
    while (cola.length) {
      for (const [x, cierto] of vecinos(cola.pop()!)) {
        if ((cierto || incierto) && !vis.has(x)) { vis.add(x); cola.push(x) }
      }
    }
    return vis
  }

  const fuentes = d.nodos.filter(n => n.tipo === 'fuente').map(n => [key(n.id, 'a'), estadoFuente(n, v, general)] as const)
  const sem = (...e: Estado[]) => fuentes.filter(([, s]) => e.includes(s)).map(([k]) => k)
  const seguro = alcanzar(sem('energizado'), false)
  const posible = alcanzar(sem('energizado', 'desconocido'), true)
  const de = (k: string): Estado => seguro.has(k) ? 'energizado' : posible.has(k) ? 'desconocido' : 'sinTension'

  const rank: Record<Estado, number> = { energizado: 2, desconocido: 1, sinTension: 0 }
  const puntos = new Map<string, Estado>()
  const nodos = new Map<string, Estado>()
  for (const n of d.nodos) {
    for (const p of puntosDe(n)) {
      const s = de(key(n.id, p))
      puntos.set(key(n.id, p), s)
      const prev = nodos.get(n.id)
      if (!prev || rank[s] > rank[prev]) nodos.set(n.id, s)
    }
  }
  const tramos = new Map<string, Estado>()
  for (const c of d.conexiones) tramos.set(c.id, de(key(c.desde[0], c.desde[1])))
  return { tramos, nodos, puntos }
}
