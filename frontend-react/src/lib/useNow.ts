import { useState, useEffect } from 'react'

/**
 * Devuelve Date.now() y fuerza un re-render cada `intervalMs`.
 * Sirve para reevaluar la detección de datos viejos (stale) aunque no
 * lleguen mensajes nuevos por MQTT.
 */
export function useNow(intervalMs = 3000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
