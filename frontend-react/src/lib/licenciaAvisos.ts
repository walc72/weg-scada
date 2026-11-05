// Avisos de vencimiento de la licencia (franja del portal y pestaña Licencia).
export interface LicVence { ok: boolean; motivo?: string; vence?: string | null; vencen?: Record<string, string>; vencidos?: string[] }

const DIA = 86_400_000
export const AVISO_DIAS = 15

export const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
export const diasHasta = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((Date.parse(iso) - now) / DIA))
const quedan = (n: number) => (n <= 1 ? 'vence hoy o mañana' : `quedan ${n} días`)

export function avisosLicencia(lic: LicVence | null, now = Date.now()): string[] {
  if (!lic) return []
  if (!lic.ok) return lic.motivo === 'vencida' && lic.vence ? [`La licencia venció el ${fechaCorta(lic.vence)}: el portal quedó en modo básico. Pedí la renovación para recuperar los módulos.`] : []
  const out: string[] = []
  if (lic.vence && diasHasta(lic.vence, now) <= AVISO_DIAS) out.push(`La licencia vence el ${fechaCorta(lic.vence)} (${quedan(diasHasta(lic.vence, now))}).`)
  // Las pruebas se avisan siempre: duran pocos días
  for (const [m, iso] of Object.entries(lic.vencen ?? {})) out.push(`Prueba del módulo ${m} hasta el ${fechaCorta(iso)} (${quedan(diasHasta(iso, now))}).`)
  if (lic.vencidos?.length) out.push(`Terminó la prueba de: ${lic.vencidos.join(', ')}. Los datos y la configuración se conservan; con la licencia definitiva vuelven a verse.`)
  return out
}
