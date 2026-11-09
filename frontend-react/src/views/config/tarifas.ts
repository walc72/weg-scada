// Modelo de tarifas eléctricas (espejo de nodered/weg-api/src/services/tarifas.js) y mutadores
// puros: cada función devuelve un archivo nuevo, nunca modifica el que recibe.
export type Tramo = { dias: number[]; desde: number; hasta: number }
export type Franja = { nombre: string; precioKwh: number; tramos: Tramo[] }
export type Cargo = { reservadaKw: number; precioKw: number; precioExcesoKw: number }
export type Potencia = null | ({ modo: 'unica' } & Cargo) | { modo: 'diferencial'; punta: Cargo; fuera: Cargo }
export type Version = {
  desde: string // 'AAAA-MM-DD' local
  franjas: Franja[]
  resto: { nombre: string; precioKwh: number }
  potencia: Potencia
}
export type Tarifa = { id: string; nombre: string; versiones: Version[] }
export type Asignacion = { tarifa: string | null; medidor: string | null }
export type ArchivoTarifas = { moneda: string; tarifas: Tarifa[]; asignacion: Record<string, Asignacion> }

export const vacio = (): ArchivoTarifas => ({ moneda: 'Gs', tarifas: [], asignacion: {} })

// Fecha local 'AAAA-MM-DD' (no UTC: de noche en Paraguay UTC ya es el día siguiente)
const hoyLocal = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Id con la forma que exige el backend: t-[a-z0-9]{4,20}
const nuevoId = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`

const editarTarifa = (a: ArchivoTarifas, id: string, f: (t: Tarifa) => Tarifa): ArchivoTarifas => {
  if (!a.tarifas.some(t => t.id === id)) throw new Error('La tarifa ya no existe; recargá la página')
  return { ...a, tarifas: a.tarifas.map(t => t.id === id ? f(t) : t) }
}

export function agregarTarifa(a: ArchivoTarifas, nombre: string): { archivo: ArchivoTarifas; id: string } {
  const id = nuevoId()
  const version: Version = { desde: hoyLocal(), franjas: [], resto: { nombre: 'Fuera de punta', precioKwh: 0 }, potencia: null }
  return { archivo: { ...a, tarifas: [...a.tarifas, { id, nombre, versiones: [version] }] }, id }
}

export function borrarTarifa(a: ArchivoTarifas, id: string): ArchivoTarifas {
  const asignacion = Object.fromEntries(
    Object.entries(a.asignacion).map(([s, x]) => [s, x.tarifa === id ? { ...x, tarifa: null } : x]),
  )
  return { ...a, tarifas: a.tarifas.filter(t => t.id !== id), asignacion }
}

// Copia profunda de la última versión (la de fecha mayor) con la fecha `desde`
export function nuevaVersion(a: ArchivoTarifas, id: string, desde: string): ArchivoTarifas {
  return editarTarifa(a, id, t => {
    if (t.versiones.some(v => v.desde === desde)) throw new Error('Ya existe una versión con esa fecha')
    const ultima = t.versiones.reduce((m, v) => v.desde > m.desde ? v : m)
    const copia: Version = { ...structuredClone(ultima), desde }
    return { ...t, versiones: [...t.versiones, copia].sort((x, y) => x.desde.localeCompare(y.desde)) }
  })
}

export function borrarVersion(a: ArchivoTarifas, id: string, desde: string): ArchivoTarifas {
  return editarTarifa(a, id, t => {
    if (t.versiones.length <= 1) throw new Error('No se puede borrar la única versión')
    return { ...t, versiones: t.versiones.filter(v => v.desde !== desde) }
  })
}

export const editarVersion = (a: ArchivoTarifas, id: string, desde: string, fn: (v: Version) => Version): ArchivoTarifas =>
  editarTarifa(a, id, t => ({ ...t, versiones: t.versiones.map(v => v.desde === desde ? fn(v) : v) }))

// Plantilla ANDE: punta de lunes a sábado de 18 a 22 h; el precio fuera de punta se conserva
export const precargarAnde = (v: Version): Version => ({
  ...v,
  franjas: [{ nombre: 'Punta', precioKwh: 0, tramos: [{ dias: [1, 2, 3, 4, 5, 6], desde: 18, hasta: 22 }] }],
  resto: { nombre: 'Fuera de punta', precioKwh: v.resto.precioKwh },
})

// Versión vigente en `hoy` ('AAAA-MM-DD'): la de mayor `desde` que no sea futura
export const vigente = (t: Tarifa, hoy: string): Version | null =>
  t.versiones.filter(v => v.desde <= hoy).reduce<Version | null>((m, v) => !m || v.desde > m.desde ? v : m, null)

// Sitios distintos (sin espacios sobrantes) en orden de aparición; '' al final si algún equipo no tiene sitio
export function sitiosDe(cfg: { devices?: { site?: string }[]; meters?: { site?: string }[] }): string[] {
  const todos = [...(cfg.devices ?? []), ...(cfg.meters ?? [])].map(x => (x.site ?? '').trim())
  const con = [...new Set(todos.filter(Boolean))]
  return todos.includes('') ? [...con, ''] : con
}

export const asignar = (a: ArchivoTarifas, sitio: string, cambio: Partial<Asignacion>): ArchivoTarifas => ({
  ...a,
  asignacion: { ...a.asignacion, [sitio]: { ...(a.asignacion[sitio] ?? { tarifa: null, medidor: null }), ...cambio } },
})
