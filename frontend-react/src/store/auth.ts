import { create } from 'zustand'

const SESSION_KEY = 'weg_auth'

const AUTH_USER = (import.meta.env.VITE_AUTH_USER as string) || 'admin'
const AUTH_PASS = (import.meta.env.VITE_AUTH_PASSWORD as string) || 'WegScada2024!'

interface AuthState {
  authed: boolean
  user: string
  login: (user: string, pass: string) => boolean
  logout: () => void
}

function isSessionValid(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === 'ok'
  } catch {
    return false
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  authed: isSessionValid(),
  user: '',

  login: (user, pass) => {
    if (user.trim() === AUTH_USER && pass === AUTH_PASS) {
      try { sessionStorage.setItem(SESSION_KEY, 'ok') } catch { /* ignore */ }
      set({ authed: true, user: user.trim() })
      return true
    }
    return false
  },

  logout: () => {
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
    set({ authed: false, user: '' })
  }
}))
