import { useEffect, useState } from 'react'
import { authFetch } from '../store/auth'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// Energía acumulada del día (kWh) por nombre de equipo/medidor.
// Reusa GET /api/reports/daily (∫ potencia·dt en InfluxDB). Refresca cada 3 min.
// En modo mock devuelve un mapa vacío (el Dashboard estima para la demo).
export function useDailyEnergy(): Map<string, number> {
  const [map, setMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (MODE === 'mock') return
    let alive = true
    const load = async () => {
      try {
        const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
        const r = await authFetch(`${API_BASE}/reports/daily?date=${date}&bucket=weg_drives`)
        if (!r.ok) return
        const s = await r.json()
        const m = new Map<string, number>()
        for (const d of (s.drives || [])) if (d && d.name != null) m.set(d.name, d.energyKwh || 0)
        for (const mt of (s.meters || [])) if (mt && mt.name != null) m.set(mt.name, mt.energyKwh || 0)
        if (alive) setMap(m)
      } catch { /* silencioso: la energía es informativa */ }
    }
    load()
    const id = setInterval(load, 180000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return map
}
