import { describe, expect, it } from 'vitest'
import { fmtDuracion } from './duracion'

describe('fmtDuracion', () => {
  it('redondea hacia abajo por tramos', () => {
    expect(fmtDuracion(47e3)).toBe('< 1 min')
    expect(fmtDuracion(12 * 60e3 + 30e3)).toBe('12 min')
    expect(fmtDuracion((3 * 60 + 12) * 60e3)).toBe('3 h 12 min')
    expect(fmtDuracion((52 * 60 + 5) * 60e3)).toBe('2 d 4 h')
  })
})
