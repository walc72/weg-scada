import { useCallback, useEffect, useId, useReducer, useRef } from 'react'
import { desregistrar, registrar } from './avisoSalida'

// visto = último original recibido por prop (`original` puede adelantarse a él tras guardar)
export interface EstadoEdicion<T> { original: T; valor: T; visto: T }
export type AccionEdicion<T> =
  | { tipo: 'editar'; valor: T | ((v: T) => T) }
  | { tipo: 'descartar' }
  | { tipo: 'original'; original: T }
  | { tipo: 'guardado'; enviado: T; base: T } // base = visto al empezar a guardar

export const esSucio = <T,>(original: T, valor: T) => JSON.stringify(original) !== JSON.stringify(valor)

export const estadoInicial = <T,>(original: T): EstadoEdicion<T> => ({ original, valor: original, visto: original })

export function edicionReducer<T>(s: EstadoEdicion<T>, a: AccionEdicion<T>): EstadoEdicion<T> {
  switch (a.tipo) {
    case 'editar':
      return { ...s, valor: typeof a.valor === 'function' ? (a.valor as (v: T) => T)(s.valor) : a.valor }
    case 'descartar':
      return { ...s, valor: s.original }
    case 'original': // original nuevo: se adopta solo si no hay cambios locales
      if (!esSucio(s.visto, a.original)) return s // misma estructura: evita bucles con identidades inestables
      return { original: a.original, visto: a.original, valor: esSucio(s.original, s.valor) ? s.valor : a.original }
    case 'guardado':
      if (esSucio(a.base, s.visto)) { // el original recargó mientras se guardaba
        return { ...s, original: s.visto, valor: esSucio(a.enviado, s.valor) ? s.valor : s.visto }
      }
      return { ...s, original: a.enviado } // lo enviado queda guardado; lo tipeado después sigue sucio
  }
}

export async function guardarCon<T>(
  fn: (v: T) => Promise<boolean>, enviado: T, base: T, dispatch: (a: AccionEdicion<T>) => void,
) {
  const ok = await fn(enviado)
  if (ok) dispatch({ tipo: 'guardado', enviado, base })
  return ok
}

export function useEdicion<T>(original: T) {
  const [s, dispatch] = useReducer(edicionReducer<T>, original, estadoInicial)
  useEffect(() => { dispatch({ tipo: 'original', original }) }, [original])
  const sucio = esSucio(s.original, s.valor)
  const sucioRef = useRef(sucio)
  sucioRef.current = sucio
  const valorRef = useRef(s.valor)
  valorRef.current = s.valor
  const vistoRef = useRef(s.visto)
  vistoRef.current = s.visto
  const id = useId()
  useEffect(() => { registrar(id, () => sucioRef.current); return () => desregistrar(id) }, [id])

  const set = useCallback((v: T | ((v: T) => T)) => dispatch({ tipo: 'editar', valor: v }), [])
  const descartar = useCallback(() => dispatch({ tipo: 'descartar' }), [])
  const guardar = useCallback(
    (fn: (v: T) => Promise<boolean>) => guardarCon(fn, valorRef.current, vistoRef.current, dispatch), [])
  return { valor: s.valor, set, sucio, descartar, guardar }
}
