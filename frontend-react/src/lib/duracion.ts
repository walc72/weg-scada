// 47 s → «< 1 min», 12 min, 3 h 12 min, 2 d 4 h
export function fmtDuracion(ms: number): string {
  const m = Math.floor(ms / 60e3)
  if (m < 1) return '< 1 min'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${m % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}
