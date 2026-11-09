// Mutadores puros de las listas de equipos (bombas, medidores, caudalímetros, reconectadores,
// reguladores, generadores, enlaces): ubican al equipo por nombre, nunca por índice.
import type { AppConfig } from '../../types'

type Equipo = { name: string; enabled?: boolean; fueraServicio?: boolean }

// Corta el guardado si `name` ya no está en la config vigente (lo borraron en otra pestaña):
// store.guardar atrapa el error, no guarda y lo muestra en un toast.
export function exigir(lista: { name: string }[] | undefined, name: string) {
  if (!(lista ?? []).some(x => x.name === name)) throw new Error(`${name} ya no existe; recargá la página`)
}

// Cambia solo el equipo `name` de la lista (si ya no existe, lanza: ver `exigir`)
export function editarEquipo<T extends { name: string }>(lista: T[] | undefined, name: string, f: (x: T) => T): T[] {
  exigir(lista, name)
  return (lista ?? []).map(x => x.name === name ? f(x) : x)
}

// Alta (orig = null) o edición del equipo `orig`; en la edición, On/Off y fuera de servicio quedan los vigentes
export function guardarEquipo<T extends Equipo>(lista: T[] | undefined, orig: string | null, eq: T): T[] {
  if (orig === null) return [...(lista ?? []), eq]
  return editarEquipo(lista, orig, x => ({ ...eq, enabled: x.enabled, fueraServicio: x.fueraServicio }))
}

// Listas cuyos equipos pueden apuntar a un enlace por «Conectado por»
const CON_ENLACE = ['gateways', 'devices', 'meters', 'flowmeters', 'reconectadores', 'reguladores', 'generadores', 'comms'] as const
type ConEnlace = { name: string; enlace?: string }
const listaDe = (c: AppConfig, k: typeof CON_ENLACE[number]) => c[k] as ConEnlace[] | undefined

export const usadoPor = (c: AppConfig, name: string): string[] =>
  CON_ENLACE.flatMap(k => (listaDe(c, k) ?? []).filter(x => x.enlace === name).map(x => x.name))

// Renombre de un enlace: los `enlace` que apuntaban al nombre viejo pasan al nuevo
export function renombrarEnlace(c: AppConfig, de: string, a: string): AppConfig {
  if (de === a) return c
  const out: Record<string, unknown> = { ...c }
  for (const k of CON_ENLACE) {
    const l = listaDe(c, k)
    if (l) out[k] = l.map(x => x.enlace === de ? { ...x, enlace: a } : x)
  }
  return out as unknown as AppConfig
}
