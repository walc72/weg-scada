import { create } from 'zustand'
import type { License } from '../types'
import { apiJson } from '../lib/api'
import { authFetch } from './auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

export const MOTIVOS: Record<string, string> = {
  'sin-licencia': 'Pegá el texto de la licencia',
  formato: 'El texto no tiene el formato de una licencia',
  firma: 'La firma no es válida',
  version: 'Versión de licencia no soportada',
  'otra-instalacion': 'La licencia es de otra instalación',
}
export const motivoTexto = (m?: string) => (m && MOTIVOS[m]) || m || 'sin licencia'

const MOCK_LICENSE: License = {
  installId: 'DEMO-0000-0000',
  ok: true,
  cliente: 'Demo',
  modulos: ['medidores', 'caudales', 'unifilar', 'generadores', 'comunicaciones', 'replica', 'backup'],
  limites: { A: 100, B: 100, C: 100 },
  uso: { A: 0, B: 4, C: 0 },
}

interface LicenseState {
  lic: License | null
  load: () => Promise<void>
  save: (text: string) => Promise<void> // lanza Error con el motivo en español
  hasModule: (name: string) => boolean
  full: (tier: 'A' | 'B' | 'C') => boolean
}

export const useLicense = create<LicenseState>((set, get) => ({
  lic: null,

  load: async () => {
    if (MODE === 'mock') { set({ lic: MOCK_LICENSE }); return }
    try { set({ lic: await apiJson<License>('/license') }) } catch { /* sin backend: queda null */ }
  },

  save: async (text) => {
    if (MODE === 'mock') return
    // apiJson descarta el motivo del 400: acá se lee la respuesta directo
    const r = await authFetch(`${API_BASE}/license`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok) throw new Error(d?.motivo ? motivoTexto(d.motivo) : d?.error || `HTTP ${r.status}`)
    await get().load()
  },

  // null = todavía cargando: no ocultar nada (evita parpadeo)
  hasModule: (name) => { const l = get().lic; return !l || l.modulos.includes(name) },
  full: (tier) => { const l = get().lic; return !!l && l.uso[tier] >= l.limites[tier] },
}))
