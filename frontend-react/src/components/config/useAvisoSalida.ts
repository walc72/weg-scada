import { useCallback, useEffect } from 'react'
import { haySinGuardar } from './avisoSalida'

const TEXTO = 'Hay cambios sin guardar. ¿Salir y perderlos?'

// Enlace que navega dentro de la app (mismo origen, http(s), misma pestaña, no descarga, no ancla)
function esNavegacionInterna(a: HTMLAnchorElement) {
  if (a.getAttribute('href')?.startsWith('#') || a.hasAttribute('download')) return false
  if (a.target && a.target !== '_self') return false
  return /^https?:$/.test(a.protocol) && a.origin === window.location.origin
}

// Única excepción a «nunca confirm()»: un diálogo propio no puede frenar de forma síncrona
// el cierre de pestaña ni la navegación del navegador.
// ponytail: BrowserRouter no tiene useBlocker; el botón «atrás» del navegador no se frena.
export function useAvisoSalida() {
  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => { if (haySinGuardar()) e.preventDefault() }
    const clic = (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (a && esNavegacionInterna(a) && haySinGuardar() && !window.confirm(TEXTO)) {
        e.preventDefault(); e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', antes)
    document.addEventListener('click', clic, true)
    return () => { window.removeEventListener('beforeunload', antes); document.removeEventListener('click', clic, true) }
  }, [])
  const confirmarSalida = useCallback(() => !haySinGuardar() || window.confirm(TEXTO), [])
  return { confirmarSalida }
}
