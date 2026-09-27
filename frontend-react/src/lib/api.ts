import { authFetch } from '../store/auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// JSON autenticado; lanza Error con el mensaje del backend si no es 2xx
export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const r = await authFetch(`${API_BASE}${path}`, { ...init, headers })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
  return d as T
}
