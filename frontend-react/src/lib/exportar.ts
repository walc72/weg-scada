const p2 = (n: number) => String(n).padStart(2, '0')
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sello = (f: Date) => `${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())}-${p2(f.getHours())}${p2(f.getMinutes())}`

// Nombre del PNG exportado: unifilar-<dibujo>-AAAA-MM-DD-HHMM.png (hora local)
export function nombreArchivo(dibujo: string, fecha: Date): string {
  const s = slug(dibujo)
  return `unifilar-${s ? s + '-' : ''}${sello(fecha)}.png`
}

// Nombre del CSV/XLSX de un gráfico: <titulo>_AAAA-MM-DD-HHMM.<ext> (hora local)
export function nombreExport(titulo: string, fecha: Date, ext: 'csv' | 'xlsx'): string {
  return `${slug(titulo) || 'grafico'}_${sello(fecha)}.${ext}`
}

// Puntos del gráfico -> tabla: Fecha/Hora + una columna por serie (null donde falta), ordenada por ts.
export function filasGrafico(
  data: Record<string, number | string>[],
  series: { key: string; label: string }[],
  unit?: string,
): { headers: string[]; rows: (Date | number | null)[][] } {
  const headers = ['Fecha/Hora', ...series.map(s => (unit ? `${s.label} (${unit})` : s.label))]
  const rows = data
    .filter(d => typeof d.ts === 'number' && isFinite(d.ts))
    .sort((a, b) => (a.ts as number) - (b.ts as number))
    .map(d => [new Date(d.ts as number), ...series.map(s => (typeof d[s.key] === 'number' ? (d[s.key] as number) : null))])
  return { headers, rows }
}

// Resolución sugerida para exportar según el largo del rango (el 1 DÍA solo se elige a mano).
export function resolucionPorDefecto(ms: number): 60 | 900 | 3600 {
  const D = 86400_000
  return ms <= 2 * D ? 60 : ms <= 31 * D ? 900 : 3600
}
