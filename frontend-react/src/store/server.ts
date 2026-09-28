import { create } from 'zustand'
import { authFetch, useAuthStore, parseRole } from './auth'

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
      // El rol guardado en la pestaña puede estar viejo (p.ej. otro admin lo cambió)
      if (d.user) useAuthStore.getState().setIdentity(d.user, parseRole(d.role))
    } catch { /* se queda en false */ }
  },
}))
