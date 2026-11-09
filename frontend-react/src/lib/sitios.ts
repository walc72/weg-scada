// Agrupa equipos por el sitio de su configuración (DeviceConfig.site).
// Grupos en orden de primera aparición en la config; dentro, el orden recibido.
// Los que no tienen sitio van a un grupo final con sitio null (solo si hay).
export function agruparPorSitio<T extends { name: string }>(items: T[], devices: { name: string; site?: string }[]): { sitio: string | null; items: T[] }[] {
  const sitioDe = new Map(devices.map(d => [d.name, d.site?.trim() || null]))
  const grupos = new Map<string | null, T[]>(devices.flatMap(d => sitioDe.get(d.name) ? [[sitioDe.get(d.name)!, []]] : []))
  grupos.set(null, [])
  for (const it of items) grupos.get(sitioDe.get(it.name) ?? null)!.push(it)
  return [...grupos].filter(([, v]) => v.length > 0).map(([sitio, items]) => ({ sitio, items }))
}
