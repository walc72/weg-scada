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
  aviso: string | null // la API avisa que el archivo guardado está dañado o tiene errores
  cargar: () => Promise<void>
  refrescar: () => Promise<void> // como cargar pero lanza si falla y no marca error (el editor conserva lo dibujado)
  guardar: (data: Unifilar) => Promise<void> // lanza Error con el mensaje de la API (409, 400...)
}

export const useUnifilarStore = create<UnifilarState>((set, get) => ({
  version: null,
  data: null,
  error: null,
  aviso: null,

  cargar: async () => {
    if (MODE === 'mock') { set({ version: 'mock', data: VACIO, error: null }); return }
    try {
      const r = await apiJson<{ version: string; data: Unifilar; warning?: string }>('/unifilar')
      set({ version: r.version, data: r.data, error: null, aviso: r.warning ?? null })
    } catch (e) { set({ error: (e as Error).message }) }
  },

  refrescar: async () => {
    if (MODE === 'mock') { set({ version: 'mock', data: VACIO, error: null }); return }
    const r = await apiJson<{ version: string; data: Unifilar; warning?: string }>('/unifilar')
    set({ version: r.version, data: r.data, error: null, aviso: r.warning ?? null })
  },

  guardar: async (data) => {
    if (MODE === 'mock') { set({ data }); return }
    const r = await apiJson<{ version: string }>('/unifilar', {
      method: 'PUT', body: JSON.stringify({ base: get().version, data }),
    })
    set({ version: r.version, data, aviso: null })
  },
}))

// Historial de guardados (solo planta, admin): lista y una versión por id
export interface EntradaHistorial { id: string; fecha: string; usuario: string; version: string; elementos: number }
export const pedirHistorial = () => apiJson<EntradaHistorial[]>('/unifilar/historial')
export const pedirVersion = (id: string) => apiJson<{ data: Unifilar }>(`/unifilar/historial/${encodeURIComponent(id)}`)
