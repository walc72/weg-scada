import { create } from 'zustand'
import { apiJson } from '../lib/api'
import type { Unifilar } from '../lib/unifilar'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

const VACIO: Unifilar = {
  version: 1, colores: 'portal',
  dibujos: [{ id: 'general', nombre: 'Red general', tipo: 'general', nodos: [], conexiones: [] }],
}

// Archivo del unifilar tal como lo guarda la API: `version` es el hash para detectar ediciones cruzadas
interface UnifilarState {
  version: string | null
  data: Unifilar | null
  error: string | null
  cargar: () => Promise<void>
  guardar: (data: Unifilar) => Promise<void> // lanza Error con el mensaje de la API (409, 400...)
}

export const useUnifilarStore = create<UnifilarState>((set, get) => ({
  version: null,
  data: null,
  error: null,

  cargar: async () => {
    if (MODE === 'mock') { set({ version: 'mock', data: VACIO, error: null }); return }
    try {
      const r = await apiJson<{ version: string; data: Unifilar }>('/unifilar')
      set({ version: r.version, data: r.data, error: null })
    } catch (e) { set({ error: (e as Error).message }) }
  },

  guardar: async (data) => {
    if (MODE === 'mock') { set({ data }); return }
    const r = await apiJson<{ version: string }>('/unifilar', {
      method: 'PUT', body: JSON.stringify({ base: get().version, data }),
    })
    set({ version: r.version, data })
  },
}))
