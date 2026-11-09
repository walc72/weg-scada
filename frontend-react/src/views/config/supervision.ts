import { GAUGE_DEFAULTS } from '../../lib/gaugeDefaults'
import type { AppConfig } from '../../types'

// Helpers puros de las pestañas de Supervisión (Zonas, Alarmas): cada sección edita
// solo su parte y la fusiona sobre la config vigente sin pisar lo de otras secciones.

export type Zonas = Record<string, Record<string, number>>        // gauge → { min, max, green, yellow, redLow }
export type Mapa<V> = Record<string, V>

// Reemplaza en `actual` las claves presentes en `editado`; un valor vacío ({}) borra la clave.
export function fusionarClaves<V extends object>(actual: Mapa<V> | undefined, editado: Mapa<V>): Mapa<V> {
  const out = { ...(actual ?? {}) }
  for (const [k, v] of Object.entries(editado)) {
    if (Object.keys(v).length) out[k] = v; else delete out[k]
  }
  return out
}

// Para cada clave de `editado`, reemplaza solo los `campos` (los demás campos de `actual`
// quedan); registros que quedan vacíos se borran.
export function fusionarCampos(actual: Mapa<Record<string, number>> | undefined, editado: Mapa<Record<string, number>>, campos: string[]) {
  const out: Mapa<Record<string, number>> = { ...(actual ?? {}) }
  for (const [k, v] of Object.entries(editado)) {
    const r: Record<string, number> = { ...(out[k] ?? {}) }
    for (const c of campos) {
      if (v[c] == null || Number.isNaN(v[c])) delete r[c]; else r[c] = v[c]
    }
    if (Object.keys(r).length) out[k] = r; else delete out[k]
  }
  return out
}

// Zonas guardadas de un equipo completadas con los defaults de su tipo.
export function zonasConDefaults(type: string, guardadas: Zonas | undefined): Zonas {
  const def: Zonas = structuredClone((GAUGE_DEFAULTS[type] ?? GAUGE_DEFAULTS.CFW900) as unknown as Zonas)
  for (const [k, z] of Object.entries(guardadas ?? {})) if (def[k]) Object.assign(def[k], z)
  return def
}

// Cada límite (verde/amarillo/rojo bajo) tiene que caer entre el mín. y el máx.
// del gauge: fuera de rango el gauge no se puede dibujar.
export function erroresZonas(quien: string, zonas: Zonas): string[] {
  const errs: string[] = []
  for (const [gauge, z] of Object.entries(zonas)) {
    if (!z) continue
    const min = Number(z.min ?? 0), max = Number(z.max)
    for (const f of ['redLow', 'green', 'yellow'] as const) {
      const v = z[f]
      if (v == null) continue
      if (!Number.isFinite(Number(v)) || (Number.isFinite(max) && (v < min || v > max))) {
        errs.push(`${quien} · ${gauge}: ${f === 'green' ? 'verde' : f === 'yellow' ? 'amarillo' : 'rojo bajo'} = ${v} (rango ${min}–${Number.isFinite(max) ? max : '?'})`)
      }
    }
  }
  return errs
}

export const mensajeErrores = (errs: string[]) =>
  `Límites fuera de rango: ${errs.slice(0, 3).join(' · ')}${errs.length > 3 ? ` (y ${errs.length - 3} más)` : ''}`

// Marca "verde fijo" en el registro de un equipo (sin claves en false).
export function conPlano(r: Record<string, boolean> | undefined, key: string, val: boolean) {
  const out = { ...(r ?? {}) }
  if (val) out[key] = true; else delete out[key]
  return out
}

// Copia de solo los `campos` de cada clave (una entrada por clave, aunque quede vacía):
// así lo que guarda otra sección no deja a esta sucia.
export function soloCampos(fuente: Mapa<Record<string, number>> | undefined, claves: string[], campos: string[]) {
  return Object.fromEntries(claves.map(k => [k, Object.fromEntries(
    campos.filter(c => fuente?.[k]?.[c] != null).map(c => [c, fuente![k][c]]))]))
}

// Aplica los `campos` editados de `defaults` u `overrides` sobre la config vigente.
// alarmSetpoints siempre sale con las dos claves: weg-api (alerts.js, setpoints.js) las lee sin `?.`.
export function conSetpoints(c: AppConfig, clave: 'defaults' | 'overrides', editado: Mapa<Record<string, number>>, campos: string[]): AppConfig {
  const as = { defaults: {}, overrides: {}, ...c.alarmSetpoints }
  return { ...c, alarmSetpoints: { ...as, [clave]: fusionarCampos(as[clave], editado, campos) } }
}
