import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt(v: number | undefined | null, decimals = 2) {
  if (v == null || isNaN(v)) return '0'
  return v.toFixed(decimals)
}

// Escape para interpolar datos (nombres de drives, faultText, etc.) en HTML
// generado como string (ventanas de impresion de PDF). Los datos vienen del
// broker MQTT, asi que nunca deben ejecutarse como markup.
export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Copia texto al portapapeles. navigator.clipboard solo existe en contextos
// seguros (HTTPS/localhost); la planta y la oficina se sirven por HTTP, así
// que ahí se usa el método clásico con un textarea temporal. El textarea va
// dentro del diálogo abierto (si lo hay): el foco de un modal no sale de él.
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const prev = document.activeElement as HTMLElement | null
  const host = prev?.closest('[role="dialog"]') ?? document.body
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  host.appendChild(ta)
  ta.focus()
  ta.select()
  try {
    if (!document.execCommand('copy')) throw new Error('copy rechazado')
  } finally {
    host.removeChild(ta)
    prev?.focus()
  }
}
