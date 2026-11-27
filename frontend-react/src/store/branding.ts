import { create } from 'zustand'
import { authFetch } from './auth'
import { aplicarColorPortal } from '../lib/color'
import { aplicarPaleta, type PaletaParcial } from '../lib/paleta'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

export interface Branding {
  name: string
  subtitle: string
  footer: string
  logoUrl: string
  customLogo: boolean
  faviconUrl: string
  customFavicon: boolean
  colorPortal: string | null   // null = azul del tema
  colorInforme: string         // títulos y tablas del PDF
  paleta: PaletaParcial        // colores de gráficos personalizados ({} = por defecto)
}

export const DEFAULT_BRANDING: Branding = {
  name: 'Planta de Bombeo',
  subtitle: 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.',
  footer: 'Tecno Electric S.A.',
  logoUrl: '/agriplus.png',
  customLogo: false,
  faviconUrl: '/favicon.svg',     // isotipo HECIAN LC (marca v0.2.1)
  customFavicon: false,
  colorPortal: null,
  colorInforme: '#E87722',
  paleta: {},
}

type Result = { ok: boolean; error?: string }

interface BrandingState extends Branding {
  load: () => Promise<void>
  save: (patch: { name?: string; subtitle?: string; footer?: string; logo?: string; favicon?: string; colorPortal?: string | null; colorInforme?: string | null; paleta?: PaletaParcial | null }) => Promise<Result>
  reset: () => Promise<Result>
}

// El backend devuelve la URL con prefijo /api; respetar VITE_API_BASE si es otro
function fromServer(b: Partial<Branding>): Branding {
  const merged = { ...DEFAULT_BRANDING, ...b }
  const rebase = (u: string) => u.replace(/^\/api(?=\/)/, API_BASE)
  return { ...merged, logoUrl: rebase(merged.logoUrl), faviconUrl: rebase(merged.faviconUrl) }
}

// La última marca vista queda en el navegador para arrancar con ella: evita
// que el login muestre un instante el nombre y el logo por defecto.
const CACHE_KEY = 'weg-branding'

function cached(): Branding {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return { ...DEFAULT_BRANDING, ...JSON.parse(raw) }
  } catch { /* sin storage o JSON roto: por defecto */ }
  return DEFAULT_BRANDING
}

// Íconos de index.html: isotipo HECIAN LC (marca v0.2.1), con el apple-touch de fondo carbón. Solo un favicon
// subido en Configuración → Marca los reemplaza; sin él quedan (o vuelven) los de la marca. El original de cada
// <link> se guarda en data-marca la primera vez.
function setIcons(href: string, propio: boolean) {
  for (const rel of ['icon', 'apple-touch-icon']) {
    const links = [...document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`)]
    if (!links.length) { const l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); links.push(l) }
    for (const l of links) {
      if (l.dataset.marca === undefined) { l.dataset.marca = l.getAttribute('href') ?? ''; l.dataset.marcaTipo = l.getAttribute('type') ?? '' }
      if (propio || !l.dataset.marca) { l.removeAttribute('type'); l.href = href } // el favicon puede ser JPG
      else { l.href = l.dataset.marca; if (l.dataset.marcaTipo) l.type = l.dataset.marcaTipo }
    }
  }
}

function apply(b: Branding) {
  document.title = b.name
  setIcons(b.faviconUrl, b.customFavicon)
  aplicarColorPortal(b.colorPortal); aplicarPaleta(b.paleta ?? {})
  try {
    const { name, subtitle, footer, logoUrl, customLogo, faviconUrl, customFavicon, colorPortal, colorInforme, paleta } = b
    localStorage.setItem(CACHE_KEY, JSON.stringify({ name, subtitle, footer, logoUrl, customLogo, faviconUrl, customFavicon, colorPortal, colorInforme, paleta }))
  } catch { /* sin storage: solo se pierde el arranque rápido */ }
}

const initial = cached()
if (initial !== DEFAULT_BRANDING) { document.title = initial.name; setIcons(initial.faviconUrl, initial.customFavicon); aplicarColorPortal(initial.colorPortal); aplicarPaleta(initial.paleta ?? {}) }

export const useBrandingStore = create<BrandingState>((set, get) => ({
  ...initial,

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
      const b = { ...get(), ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}), ...(patch.footer !== undefined ? { footer: patch.footer } : {}), ...(patch.colorPortal !== undefined ? { colorPortal: patch.colorPortal } : {}) }
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
