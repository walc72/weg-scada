// Nombre del PNG exportado: unifilar-<dibujo>-AAAA-MM-DD-HHMM.png (hora local)
export function nombreArchivo(dibujo: string, fecha: Date): string {
  const slug = dibujo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const p = (n: number) => String(n).padStart(2, '0')
  const f = `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}`
  return `unifilar-${slug ? slug + '-' : ''}${f}.png`
}
