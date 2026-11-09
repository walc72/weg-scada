import { useEffect, useId, useRef } from 'react'
import { desregistrar, registrar } from './avisoSalida'

// Cambios pendientes fuera de useEdicion (fila en edición, archivo elegido): cuentan para el aviso de salida
export function useAvisoPendiente(pendiente: boolean) {
  const ref = useRef(pendiente)
  ref.current = pendiente
  const id = useId()
  useEffect(() => { registrar(id, () => ref.current); return () => desregistrar(id) }, [id])
}
