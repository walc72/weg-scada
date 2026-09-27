import { create } from 'zustand'
import { authFetch } from './auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

// Datos del servidor al que estamos conectados (p.ej. si es la réplica de oficina)
interface ServerState {
  replica: boolean
  load: () => Promise<void>
}

export const useServerStore = create<ServerState>((set) => ({
  replica: false,
  load: async () => {
    if (MODE === 'mock') return
    try {
      const r = await authFetch(`${API_BASE}/me`)
      if (!r.ok) return
      const d = await r.json()
      set({ replica: !!d.replica })
    } catch { /* se queda en false */ }
  },
}))
