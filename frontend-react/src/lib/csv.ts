// CSV para Excel en español: BOM, ';' como separador, coma decimal, CRLF.
// Mismas reglas que nodered/weg-api/src/services/exportar.js (aCSV).

type Celda = string | number | Date | null | undefined

const p2 = (n: number) => String(n).padStart(2, '0')

function celda(v: Celda): string {
  if (v == null) return ''
  let s: string
  if (v instanceof Date) {
    s = isNaN(v.getTime()) ? '' : `${p2(v.getDate())}/${p2(v.getMonth() + 1)}/${v.getFullYear()} ${p2(v.getHours())}:${p2(v.getMinutes())}`
  } else if (typeof v === 'number') {
    s = isFinite(v) ? String(v).replace('.', ',') : ''
  } else s = String(v)
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function aCSV(headers: string[], rows: Celda[][]): string {
  return '﻿' + [headers, ...rows].map(r => r.map(celda).join(';')).join('\r\n')
}

export function descargarBlob(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  URL.revokeObjectURL(url)
}

export function descargarCSV(nombre: string, headers: string[], rows: Celda[][]): void {
  descargarBlob(nombre, new Blob([aCSV(headers, rows)], { type: 'text/csv;charset=utf-8' }))
}
