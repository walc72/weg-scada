import { useCallback, useState } from 'react'

// Estado "guardando" propio de una sección (no el `loading` global del store).
export function useGuardando() {
  const [guardando, setGuardando] = useState(false)
  const correr = useCallback(async (fn: () => Promise<unknown>) => {
    setGuardando(true)
    try { await fn() } finally { setGuardando(false) }
  }, [])
  return [guardando, correr] as const
}
