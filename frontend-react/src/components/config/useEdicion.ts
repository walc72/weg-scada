import { useCallback, useEffect, useId, useReducer, useRef } from 'react'
import { desregistrar, registrar } from './avisoSalida'

export interface EstadoEdicion<T> { original: T; valor: T }
export type AccionEdicion<T> =
  | { tipo: 'editar'; valor: T | ((v: T) => T) }
  | { tipo: 'descartar' }
  | { tipo: 'original'; original: T }
  | { tipo: 'guardado' }

export const esSucio = <T,>(original: T, valor: T) => JSON.stringify(original) !== JSON.stringify(valor)

export function edicionReducer<T>(s: EstadoEdicion<T>, a: AccionEdicion<T>): EstadoEdicion<T> {
  switch (a.tipo) {
    case 'editar':
      return { ...s, valor: typeof a.valor === 'function' ? (a.valor as (v: T) => T)(s.valor) : a.valor }
    case 'descartar':
      return { ...s, valor: s.original }
    case 'original': // llegó un original nuevo: se adopta solo si no hay cambios locales
      return { original: a.original, valor: esSucio(s.original, s.valor) ? s.valor : a.original }
    case 'guardado': // lo editado pasa a ser lo guardado hasta que llegue el original
      return { ...s, original: s.valor }
  }
}

export function useEdicion<T>(original: T) {
  const [s, dispatch] = useReducer(edicionReducer<T>, { original, valor: original })
  useEffect(() => { dispatch({ tipo: 'original', original }) }, [original])
  const sucio = esSucio(s.original, s.valor)
  const sucioRef = useRef(sucio)
  sucioRef.current = sucio
  const valorRef = useRef(s.valor)
  valorRef.current = s.valor
  const id = useId()
  useEffect(() => { registrar(id, () => sucioRef.current); return () => desregistrar(id) }, [id])

  const set = useCallback((v: T | ((v: T) => T)) => dispatch({ tipo: 'editar', valor: v }), [])
  const descartar = useCallback(() => dispatch({ tipo: 'descartar' }), [])
  const guardar = useCallback(async (fn: (v: T) => Promise<boolean>) => {
    const ok = await fn(valorRef.current)
    if (ok) dispatch({ tipo: 'guardado' })
    return ok
  }, [])
  return { valor: s.valor, set, sucio, descartar, guardar }
}
