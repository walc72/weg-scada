import type { CampoState } from '../types'

// Modo del controlador (DSE GenComm, página 3 registro 4)
export const MODO_GEN: Record<number, string> = {
  0: 'Stop', 1: 'Automático', 2: 'Manual', 3: 'Prueba con carga', 4: 'Auto con restauración manual', 5: 'Configuración', 6: 'Prueba sin carga',
}
// Otros modelos numeran el modo distinto (ComAp InteliLite 4: reg. 1382).
// SmartGen informa un coil por modo: `senales` en el orden de los números de `textos`.
const MODOS: Record<string, { textos: Record<number, string>; auto: number; senales?: string[] }> = {
  il4: { textos: { 0: 'Off', 1: 'Manual', 2: 'Automático', 3: 'Prueba' }, auto: 2 },
  hgm6120: { textos: { 0: 'Stop', 1: 'Automático', 2: 'Manual', 3: 'Prueba' }, auto: 1, senales: ['Modo stop', 'Modo automático', 'Modo manual', 'Modo prueba'] },
}
// Valor del modo: el registro `modo` o, si el modelo usa un coil por modo, el primero activo
export function modoDe(st?: CampoState): number | undefined {
  const v = st?.valores?.modo
  if (typeof v === 'number') return v
  const i = MODOS[st?.modelo ?? '']?.senales?.findIndex(n => st?.senales?.[n] === true) ?? -1
  return i >= 0 ? i : undefined
}
export const modoTexto = (modelo: string | undefined, v: unknown) =>
  typeof v === 'number' ? (MODOS[modelo ?? '']?.textos ?? MODO_GEN)[v] ?? `Modo ${v}` : '—'
const esAuto = (modelo: string | undefined, v: unknown) => v === (MODOS[modelo ?? '']?.auto ?? 1)

export type EstadoGenId = 'fuera_servicio' | 'sin_com' | 'falla' | 'advertencia' | 'carga' | 'marcha' | 'auto' | 'parado'
// tono: mismos nombres que Chip de CampoBase (run = verde, p1/p3 = alarma, com = sin comunicación)
export interface EstadoGen { id: EstadoGenId; texto: string; tono: 'run' | 'p1' | 'p3' | 'com' | 'off' }

const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : null)
const RPM_MARCHA = 300
const KW_CARGA = 0.5

// Estado de un grupo electrógeno, por prioridad (como getModo de GenMonitor).
// Fuera de servicio va primero: el poller lo publica con online:false.
// Alarma con nivel 2 (GenComm) = advertencia; parada, disparo o sin nivel = falla.
export function estadoGen(st?: CampoState): EstadoGen {
  if (st?.fueraServicio) return { id: 'fuera_servicio', texto: 'FUERA DE SERVICIO', tono: 'off' }
  if (!st || !st.online || st.license === 'excedido') {
    return { id: 'sin_com', texto: st?.license === 'excedido' ? 'FUERA DE LICENCIA' : 'SIN COMUNICACIÓN', tono: 'com' }
  }
  const alarmas = Object.keys(st.alarmas ?? {})
  if (alarmas.length) {
    const falla = alarmas.some(k => (st.niveles?.[k] ?? 3) !== 2)
    return falla ? { id: 'falla', texto: 'FALLA', tono: 'p1' } : { id: 'advertencia', texto: 'ADVERTENCIA', tono: 'p3' }
  }
  const rpm = num(st.valores.rpm) ?? 0, kw = num(st.valores.kw) ?? 0
  if (rpm > RPM_MARCHA && kw > KW_CARGA) return { id: 'carga', texto: 'EN CARGA', tono: 'run' }
  if (rpm > RPM_MARCHA) return { id: 'marcha', texto: 'EN MARCHA', tono: 'run' }
  if (esAuto(st.modelo, modoDe(st))) return { id: 'auto', texto: 'AUTOMÁTICO', tono: 'off' }
  return { id: 'parado', texto: 'PARADO', tono: 'off' }
}

// Promedio de las tensiones disponibles (null si no hay ninguna)
export function promedio(valores: CampoState['valores'] | undefined, keys: string[]): number | null {
  const vs = keys.map(k => num(valores?.[k])).filter((v): v is number => v != null)
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
}
export const VLL = ['vl1l2', 'vl2l3', 'vl3l1']
export const VLN = ['vl1n', 'vl2n', 'vl3n']
