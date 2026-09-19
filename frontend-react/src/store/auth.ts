import { create } from 'zustand'

const TOKEN_KEY = 'weg_auth_token'
const USER_KEY = 'weg_auth_user'
const ROLE_KEY = 'weg_auth_role'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

export type Role = 'admin' | 'operador' | ''

interface AuthState {
  authed: boolean
  user: string
  role: Role
  token: string | null
  isAdmin: () => boolean
  login: (user: string, pass: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

function ls(key: string): string {
  try { return sessionStorage.getItem(key) || '' } catch { return '' }
}
function lsSet(key: string, val: string) {
  try { sessionStorage.setItem(key, val) } catch { /* ignore */ }
}
function lsDel(key: string) {
  try { sessionStorage.removeItem(key) } catch { /* ignore */ }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  authed: !!ls(TOKEN_KEY),
  user: ls(USER_KEY),
  role: (ls(ROLE_KEY) as Role) || '',
  token: ls(TOKEN_KEY) || null,

  isAdmin: () => get().role === 'admin',

  login: async (user, pass) => {
    try {
      const r = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: user.trim(), password: pass })
      })
      if (!r.ok) {
        const body = await r.json().catch(() => null)
        if (r.status === 429) return { ok: false, error: body?.error || 'Demasiados intentos — esperá unos minutos' }
        return { ok: false, error: 'Usuario o contraseña incorrectos' }
      }
      const data = await r.json()
      if (!data.token) return { ok: false, error: 'Respuesta inválida del servidor' }
      const role: Role = data.role === 'admin' || data.role === 'operador' ? data.role : 'operador'
      lsSet(TOKEN_KEY, data.token)
      lsSet(USER_KEY, user.trim())
      lsSet(ROLE_KEY, role)
      set({ authed: true, user: user.trim(), role, token: data.token })
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor' }
    }
  },

  logout: async () => {
    const token = get().token
    try {
      if (token) {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      }
    } catch { /* ignore */ }
    lsDel(TOKEN_KEY); lsDel(USER_KEY); lsDel(ROLE_KEY)
    set({ authed: false, user: '', role: '', token: null })
  }
}))

// Re-verifica la contraseña del usuario actual contra el backend.
// Usado por el gate de Configuración (confirmación extra antes de editar).
export async function verifyPassword(pass: string): Promise<boolean> {
  const user = useAuthStore.getState().user || 'admin'
  try {
    const r = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password: pass })
    })
    if (!r.ok) return false
    const data = await r.json().catch(() => null)
    // Revocar el token extra emitido solo para esta verificacion
    if (data?.token) {
      fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${data.token}` }
      }).catch(() => { /* ignore */ })
    }
    return true
  } catch {
    return false
  }
}

// Helper para fetch autenticado — usar en lugar de fetch() en toda la app
export function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers }).then(r => {
    if (r.status === 401) {
      // Token expirado o invalido → forzar logout
      useAuthStore.getState().logout()
    }
    return r
  })
}
