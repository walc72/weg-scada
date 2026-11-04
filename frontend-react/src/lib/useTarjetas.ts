import { useEffect, useState } from 'react'
import { authFetch } from '../store/auth'
import type { Drive } from '../types'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// Resumen por bomba de GET /api/reports/tarjetas: desde cuándo está en su estado actual
// y su corriente de la última hora (un valor por minuto, null donde falta).
export type EstadoHist = 'marcha' | 'parada' | 'falla' | 'sin_com' | 'sin_datos'
export interface Tarjeta { estado: EstadoHist; desde: number; mas24h: boolean; corriente: (number | null)[] }

// Refresca cada 1 min. En modo mock arma datos de ejemplo a partir del estado en vivo.
export function useTarjetas(drives: Drive[]): Record<string, Tarjeta> {
  const [data, setData] = useState<Record<string, Tarjeta>>({})
  const mockKey = MODE === 'mock' ? drives.map(d => `${d.name}:${d.online}:${d.running}:${d.hasFault}`).join('|') : ''

  useEffect(() => {
    if (MODE !== 'mock') return
    const ahora = Date.now()
    setData(Object.fromEntries(drives.map((d, i) => [d.name, {
      estado: !d.online ? 'sin_com' : d.hasFault ? 'falla' : d.running ? 'marcha' : 'parada',
      desde: ahora - (i % 3 === 2 ? 2 * 864e5 : (i + 1) * 47 * 60e3),
      mas24h: i === 1,
      corriente: Array.from({ length: 60 }, (_, k) => d.running ? Math.round((d.current || 60) * (0.9 + 0.2 * Math.sin((k + i * 7) / 6))) : 0),
    } satisfies Tarjeta])))
  }, [mockKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (MODE === 'mock') return
    let alive = true
    const load = async () => {
      try {
        const r = await authFetch(`${API_BASE}/reports/tarjetas`)
        if (r.ok && alive) setData(await r.json())
      } catch { /* informativo: sin dato no se muestra */ }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return data
}
