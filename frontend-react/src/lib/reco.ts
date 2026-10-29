import type { CampoState } from '../types'

// Estado de un reconectador: DISPARO activo manda sobre el estado (1/true = cerrado, 0/false = abierto)
export function recoCerrado(st: Pick<CampoState, 'alarmas' | 'valores'>): 'disparo' | 'cerrado' | 'abierto' | null {
  if (st.alarmas.DISPARO) return 'disparo'
  const e = st.valores.estado
  if (e === 1 || e === true) return 'cerrado'
  if (e === 0 || e === false) return 'abierto'
  return null
}
