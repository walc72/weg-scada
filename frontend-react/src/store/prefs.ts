// Preferencias por usuario guardadas en el servidor (/api/prefs): layout del Dashboard y «Mis gráficos».
import { create } from 'zustand'
import { apiJson } from '@/lib/api'
import type { Layout } from '@/lib/gadgets'
import type { Grafico } from '@/lib/misGraficos'

type Clave = 'dashboard' | 'misGraficos'
type Valor = { dashboard: Layout; misGraficos: Grafico[] }

export const claveLocalGraficos = (user: string) => `weg_mis_graficos:${user || 'anon'}`

// Lo que hay que subir desde el navegador: solo si el servidor no tiene nada y lo local es una lista no vacía
export function migrarMisGraficos(user: string, servidor: Grafico[] | null, leerLocal: (k: string) => string | null): Grafico[] | null {
  if (servidor !== null) return null
  try {
    const g = JSON.parse(leerLocal(claveLocalGraficos(user)) || '[]')
    return Array.isArray(g) && g.length ? g : null
  } catch { return null }
}

const put = (ruta: string, v: unknown) => apiJson(ruta, { method: 'PUT', body: JSON.stringify(v) })

interface PrefsState {
  estado: 'cargando' | 'listo' | 'error'
  dashboard: Layout | null
  misGraficos: Grafico[] | null
  defecto: Layout | null
  cargar: (user: string) => Promise<void>
  guardar: <K extends Clave>(clave: K, v: Valor[K]) => Promise<void>
  borrar: (clave: Clave) => Promise<void>
  guardarDefecto: (l: Layout) => Promise<void>
  borrarDefecto: () => Promise<void>
}

export const usePrefs = create<PrefsState>((set) => ({
  estado: 'cargando', dashboard: null, misGraficos: null, defecto: null,

  async cargar(user) {
    set({ estado: 'cargando' })
    try {
      const d = await apiJson<{ dashboard: Layout | null; misGraficos: Grafico[] | null; defecto?: { dashboard: Layout | null } }>('/prefs')
      let misGraficos = d.misGraficos ?? null
      const subir = migrarMisGraficos(user, misGraficos, k => { try { return localStorage.getItem(k) } catch { return null } })
      if (subir) {
        try { await put('/prefs/misGraficos', subir); misGraficos = subir } catch { /* se reintenta en la próxima carga */ }
      }
      set({ estado: 'listo', dashboard: d.dashboard ?? null, misGraficos, defecto: d.defecto?.dashboard ?? null })
    } catch {
      set({ estado: 'error' })
    }
  },

  async guardar(clave, v) {
    await put(`/prefs/${clave}`, v)
    set({ [clave]: v } as Partial<PrefsState>)
  },
  async borrar(clave) {
    await apiJson(`/prefs/${clave}`, { method: 'DELETE' })
    set({ [clave]: null } as Partial<PrefsState>)
  },
  async guardarDefecto(l) {
    await put('/prefs/defecto/dashboard', l)
    set({ defecto: l })
  },
  async borrarDefecto() {
    await apiJson('/prefs/defecto/dashboard', { method: 'DELETE' })
    set({ defecto: null })
  },
}))
