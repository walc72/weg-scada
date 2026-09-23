import { useEffect, useState } from 'react'
import { authFetch } from '../store/auth'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// Datos del día por equipo/medidor, desde el MISMO cálculo del Reporte Diario
// (GET /api/reports/daily, ventana 00:00 → ahora, hora local): así el kWh del
// Dashboard cierra igual que el del reporte.
export interface DailyStat {
  energyKwh: number
  maxPowerKw: number | null   // potencia máxima alcanzada en el día (kW)
  opHours: number | null      // horas de marcha del día (solo bombas)
}

// Refresca cada 1 min. En modo mock devuelve un mapa vacío (el Dashboard estima).
export function useDailyEnergy(): Map<string, DailyStat> {
  const [map, setMap] = useState<Map<string, DailyStat>>(new Map())

  useEffect(() => {
    if (MODE === 'mock') return
    let alive = true
    const load = async () => {
      try {
        const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
        const r = await authFetch(`${API_BASE}/reports/daily?date=${date}&bucket=weg_drives`)
        if (!r.ok) return
        const s = await r.json()
        const m = new Map<string, DailyStat>()
        for (const d of (s.drives || [])) {
          if (d && d.name != null) m.set(d.name, { energyKwh: d.energyKwh || 0, maxPowerKw: d.stats?.power?.max ?? null, opHours: d.opHours ?? null })
        }
        for (const mt of (s.meters || [])) {
          if (mt && mt.name != null) m.set(mt.name, { energyKwh: mt.energyKwh || 0, maxPowerKw: mt.stats?.power?.max ?? null, opHours: null })
        }
        if (alive) setMap(m)
      } catch { /* silencioso: es informativo */ }
    }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return map
}
