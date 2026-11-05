import { create } from 'zustand'
import type { License, TipoEquipo } from '../types'
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
  vencida: 'La licencia está vencida',
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

export const TIPO_LABEL: Record<TipoEquipo, string> = {
  variadores: 'Variadores', medidores: 'Medidores', caudalimetros: 'Caudalímetros',
  reconectadores: 'Reconectadores', reguladores: 'Reguladores', generadores: 'Generadores', comunicaciones: 'Equipos de red',
}
// Nivel de cada tipo en las licencias por nivel (A/B/C)
const TIER: Record<TipoEquipo, 'A' | 'B' | 'C'> = {
  variadores: 'B', medidores: 'B', caudalimetros: 'A', reconectadores: 'B', reguladores: 'B', generadores: 'C', comunicaciones: 'A',
}

// Uso y cupo que aplican a un tipo: por tipo si la licencia trae equipos, si no por su nivel.
export function cupoTipo(l: License, tipo: TipoEquipo) {
  if (l.equipos) return { uso: l.usoEquipos?.[tipo] ?? 0, max: l.equipos[tipo] ?? 0, label: TIPO_LABEL[tipo] }
  const t = TIER[tipo]
  return { uso: l.uso[t], max: l.limites[t], label: `nivel ${t}` }
}

interface LicenseState {
  lic: License | null
  load: () => Promise<void>
  save: (text: string) => Promise<void> // lanza Error con el motivo en español
  renovar: () => Promise<string>        // mensaje para el usuario; lanza Error si falla
  hasModule: (name: string) => boolean
  full: (tipo: TipoEquipo) => boolean
  limitMsg: (tipo: TipoEquipo) => string
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

  renovar: async () => {
    if (MODE === 'mock') return 'La licencia ya estaba al día'
    const r = await authFetch(`${API_BASE}/license/renovar`, { method: 'POST' })
    const d = await r.json().catch(() => null)
    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
    await get().load()
    return d?.mensaje || 'Listo'
  },

  // null = todavía cargando: no ocultar nada (evita parpadeo)
  hasModule: (name) => { const l = get().lic; return !l || l.modulos.includes(name) },
  full: (tipo) => { const l = get().lic; if (!l) return false; const c = cupoTipo(l, tipo); return c.uso >= c.max },
  limitMsg: (tipo) => { const l = get().lic; if (!l) return ''; const c = cupoTipo(l, tipo); return `Límite de la licencia: ${c.label} ${c.uso}/${c.max}` },
}))
