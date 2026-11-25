import { describe, expect, it } from 'vitest'
import { fmtUltimo } from './BusSerie'

describe('fmtUltimo', () => {
  it('sin reinicios dice Nunca', () => {
    expect(fmtUltimo({ gateway: 'PLC', disponible: true, minDesdeUltimo: null })).toBe('Nunca')
  })
  it('minutos u horas, con el motivo', () => {
    expect(fmtUltimo({ gateway: 'PLC', disponible: true, minDesdeUltimo: 5, motivoUltimo: 'automatico' })).toBe('hace 5 min · automático')
    expect(fmtUltimo({ gateway: 'PLC', disponible: true, minDesdeUltimo: 130, motivoUltimo: 'portal' })).toBe('hace 2 h · desde el portal')
  })
})
