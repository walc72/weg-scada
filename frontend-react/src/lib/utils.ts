import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt(v: number | undefined | null, decimals = 2) {
  if (v == null || isNaN(v)) return '0'
  return v.toFixed(decimals)
}
