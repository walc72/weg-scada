import { create } from 'zustand'
import { authFetch } from './auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

export interface Branding {
  name: string
  subtitle: string
  logoUrl: string
  customLogo: boolean
}

export const DEFAULT_BRANDING: Branding = {
  name: 'Planta de Bombeo',
  subtitle: 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.',
  logoUrl: '/agriplus.png',
  customLogo: false,
}

type Result = { ok: boolean; error?: string }

interface BrandingState extends Branding {
  load: () => Promise<void>
  save: (patch: { name?: string; subtitle?: string; logo?: string }) => Promise<Result>
  reset: () => Promise<Result>
}

// El backend devuelve la URL con prefijo /api; respetar VITE_API_BASE si es otro
function fromServer(b: Partial<Branding>): Branding {
  const merged = { ...DEFAULT_BRANDING, ...b }
  return { ...merged, logoUrl: merged.logoUrl.replace(/^\/api(?=\/)/, API_BASE) }
}

function apply(b: Branding) {
  document.title = b.name
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  ...DEFAULT_BRANDING,

  // Público (sin token): el login lo necesita antes de autenticarse
  load: async () => {
    if (MODE === 'mock') { apply(get()); return }
    try {
      const r = await fetch(`${API_BASE}/branding`)
      if (!r.ok) return
      const b = fromServer(await r.json())
      set(b)
      apply(b)
    } catch { /* sin backend: quedan los valores por defecto */ }
  },

  save: async (patch) => {
    if (MODE === 'mock') {
      const b = { ...get(), ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}) }
      set(b); apply(b)
      return { ok: true }
    }
    try {
      const r = await authFetch(`${API_BASE}/branding`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, error: d?.error || `HTTP ${r.status}` }
      const b = fromServer(d)
      set(b); apply(b)
      return { ok: true }
    } catch (e: any) { return { ok: false, error: e.message } }
  },

  reset: async () => {
    if (MODE === 'mock') { set(DEFAULT_BRANDING); apply(DEFAULT_BRANDING); return { ok: true } }
    try {
      const r = await authFetch(`${API_BASE}/branding`, { method: 'DELETE' })
      const d = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, error: d?.error || `HTTP ${r.status}` }
      const b = fromServer(d)
      set(b); apply(b)
      return { ok: true }
    } catch (e: any) { return { ok: false, error: e.message } }
  },
}))
