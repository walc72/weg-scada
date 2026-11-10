// Gadget «Gauges»: varias variables en vivo (equipo + variable) dibujadas como arco. Puro, sin React.
import type { AppConfig, CampoState, Drive, Meter } from '../types'
import { VARIABLES, type Src } from './misGraficos'
import { resolveZone, type GaugeKey } from './gaugeDefaults'
import { isStale } from './stale'
import slug from './slug'

export const MAX_GAUGES = 12
// min/max/alerta/alarma: lo que el usuario cargó; lo que falta sale del rango por defecto
export type Gauge = { src: Src; name: string; field: string; min?: number; max?: number; alerta?: number; alarma?: number }
// Zona para el arco (misma forma que `barra()` de HalfGauge). Sin green/yellow = sin zonas (plain).
export type Zona = { min: number; max: number; green?: number; yellow?: number; redLow?: number; invert?: boolean; bipolar?: boolean }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const SRCS = Object.keys(VARIABLES) as Src[]

export function sanearGauges(o: unknown): Gauge[] {
  if (!Array.isArray(o)) return []
  const out: Gauge[] = []
  for (const x of o) {
    if (out.length >= MAX_GAUGES) break
    const g = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const src = g.src as Src
    if (!SRCS.includes(src) || typeof g.name !== 'string' || !g.name) continue
    if (typeof g.field !== 'string' || !VARIABLES[src].some(v => v.field === g.field)) continue
    const r: Gauge = { src, name: g.name.slice(0, 80), field: g.field }
    for (const k of ['min', 'max', 'alerta', 'alarma'] as const) { const n = num(g[k]); if (n !== undefined) r[k] = n }
    if (r.min !== undefined && r.max !== undefined && r.max <= r.min) { delete r.min; delete r.max }
    out.push(r)
  }
  return out
}

// Variable del buffer en vivo de una bomba (las claves de Drive no son las de InfluxDB)
const DRIVE_PROP: Record<string, keyof Drive> = {
  current: 'current', power: 'power', voltage: 'outputVoltage', motor_speed: 'motorSpeed',
  frequency: 'frequency', igbt_temp: 'igbtTemp', scr_temp: 'scrTemp',
}
const DRIVE_ZONA: Record<string, GaugeKey> = { current: 'corriente', motor_speed: 'velocidad', voltage: 'tension', frequency: 'frecuencia' }
// medidor: mismas zonas por defecto que PM8000Card (kV y kW)
const METER_DEF: Record<string, Zona> = {
  voltage: { min: 0, max: 36, redLow: 30, green: 33, yellow: 34.5 },
  current: { min: 0, max: 200, green: 120, yellow: 170 },
  power: { min: 0, max: 2000, green: 1500, yellow: 1800 },
  pf: { min: 0, max: 1, bipolar: true },
}
// ponytail: rangos genéricos sin zonas; el usuario los ajusta en ⚙ si su equipo es distinto
const DEF: Record<string, Zona> = {
  'drive.power': { min: 0, max: 200 },
  'drive.igbt_temp': { min: 0, max: 100, green: 70, yellow: 85 },
  'drive.scr_temp': { min: 0, max: 100, green: 70, yellow: 85 },
  'reco.ia': { min: 0, max: 600 }, 'reco.ib': { min: 0, max: 600 }, 'reco.ic': { min: 0, max: 600 },
  'reg.tap': { min: -16, max: 16 }, 'reg.v': { min: 0, max: 150 }, 'reg.vConsigna': { min: 0, max: 150 },
  'gen.kw': { min: 0, max: 500 }, 'gen.vl1l2': { min: 0, max: 500 }, 'gen.il1': { min: 0, max: 1000 },
  'gen.hz': { min: 0, max: 70 }, 'gen.rpm': { min: 0, max: 2000 },
  'gen.x_temperatura_refrigerante': { min: 0, max: 120, green: 95, yellow: 105 },
  'gen.x_nivel_de_combustible': { min: 0, max: 100, green: 15, yellow: 30, invert: true },
  'gen.x_tension_de_bateria': { min: 0, max: 30 },
}

function zonaDefecto(g: Gauge, cfg: AppConfig | null, drives: Map<string, Drive>): Zona {
  if (g.src === 'drive' && DRIVE_ZONA[g.field]) {
    const k = DRIVE_ZONA[g.field]
    return resolveZone(drives.get(g.name)?.type ?? 'CFW900', k, cfg?.gaugeZones?.[g.name]?.[k])
  }
  if (g.src === 'meter') {
    const z = cfg?.meters?.find(m => m.name === g.name)?.ui?.zones as Record<string, Zona> | undefined
    return { ...METER_DEF[g.field], ...z?.[g.field], ...(g.field === 'pf' ? { bipolar: true } : {}) }
  }
  return DEF[`${g.src}.${g.field}`] ?? { min: 0, max: 100 }
}

// Zona efectiva: lo cargado por el usuario pisa al defecto. Con alerta y alarma cargadas,
// alerta > alarma significa «bajo es malo» (p. ej. combustible).
export function zonaDe(g: Gauge, cfg: AppConfig | null, drives: Map<string, Drive>): Zona {
  const d = zonaDefecto(g, cfg, drives)
  let z: Zona = { ...d, min: g.min ?? d.min, max: g.max ?? d.max }
  if (g.alerta !== undefined && g.alarma !== undefined) {
    const invert = g.alerta > g.alarma
    z = { min: z.min, max: z.max, invert, green: invert ? g.alarma : g.alerta, yellow: invert ? g.alerta : g.alarma }
  }
  if (z.max <= z.min) z.max = z.min + 1
  return z
}

export type Lectura = { valor: number | null; stale: boolean }
type Estado = { drives: Map<string, Drive>; meters: Map<string, Meter>; campo: Map<string, CampoState> }

// Valor en vivo. Sin comunicación → null («—»); online pero sin actualizar → stale (gris).
export function lectura(g: Gauge, s: Estado, ahora: number): Lectura {
  if (g.src === 'drive') {
    const d = s.drives.get(g.name)
    if (!d?.online) return { valor: null, stale: false }
    return { valor: num(d[DRIVE_PROP[g.field]]) ?? null, stale: isStale(d._ts, ahora, d.pollMs) }
  }
  if (g.src === 'meter') {
    const m = s.meters.get(g.name)
    if (!m?.online) return { valor: null, stale: false }
    const v = num((m as unknown as Record<string, unknown>)[g.field])
    const esc = VARIABLES.meter.find(x => x.field === g.field)?.scale ?? 1
    return { valor: v === undefined ? null : v * esc, stale: isStale(m._ts, ahora, m.pollMs) }
  }
  const c = s.campo.get(g.name)
  if (!c?.online || c.kind !== g.src) return { valor: null, stale: false }
  // valores con la misma clave que InfluxDB; las mediciones libres van como x_<slug>
  let v = num(c.valores?.[g.field])
  if (v === undefined && g.field.startsWith('x_')) {
    const e = Object.entries(c.extras ?? {}).find(([n]) => 'x_' + slug(n) === g.field)
    v = num(e?.[1])
  }
  return { valor: v ?? null, stale: isStale(c._ts ?? c.ts, ahora, c.pollMs) }
}
