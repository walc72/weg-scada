import { create } from 'zustand'

const TOKEN_KEY = 'weg_auth_token'
const USER_KEY = 'weg_auth_user'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

interface AuthState {
  authed: boolean
  user: string
  token: string | null
  login: (user: string, pass: string) => Promise<boolean>
  logout: () => Promise<void>
}

function getStoredToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}
function getStoredUser(): string {
  try { return sessionStorage.getItem(USER_KEY) || '' } catch { return '' }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  authed: !!getStoredToken(),
  user: getStoredUser(),
  token: getStoredToken(),

  login: async (user, pass) => {
    try {
      const r = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: user.trim(), password: pass })
      })
      if (!r.ok) return false
      const data = await r.json()
      if (!data.token) return false
      try {
        sessionStorage.setItem(TOKEN_KEY, data.token)
        sessionStorage.setItem(USER_KEY, user.trim())
      } catch { /* ignore */ }
      set({ authed: true, user: user.trim(), token: data.token })
      return true
    } catch {
      return false
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
    try {
      sessionStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem(USER_KEY)
    } catch { /* ignore */ }
    set({ authed: false, user: '', token: null })
  }
}))

// Re-verifica la contraseña del usuario actual contra el backend.
// Usado por el gate de Configuración: antes comparaba contra una password
// embebida en el bundle (VITE_CONFIG_PASSWORD), visible para cualquiera.
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
