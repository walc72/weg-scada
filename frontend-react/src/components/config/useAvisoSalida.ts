import { useCallback, useEffect } from 'react'
import { haySinGuardar } from './avisoSalida'

const TEXTO = 'Hay cambios sin guardar en Configuración. ¿Salir y perderlos?'

// Única excepción a «nunca confirm()»: un diálogo propio no puede frenar de forma síncrona
// el cierre de pestaña ni la navegación del navegador.
// ponytail: BrowserRouter no tiene useBlocker; el botón «atrás» del navegador no se frena.
export function useAvisoSalida() {
  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => { if (haySinGuardar()) e.preventDefault() }
    const clic = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]')
      if (a && !a.getAttribute('href')?.startsWith('#') && haySinGuardar() && !window.confirm(TEXTO)) {
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
