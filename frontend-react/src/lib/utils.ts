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
