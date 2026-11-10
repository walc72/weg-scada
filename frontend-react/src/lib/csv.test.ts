import { describe, it, expect } from 'vitest'
import { aCSV } from './csv'

describe('aCSV', () => {
  it('BOM, coma decimal, comillas, fecha local y nulos', () => {
    const out = aCSV(['A', 'B'], [[12.5, null], [0, 'x;y'], ['di"jo', new Date(2026, 10, 10, 8, 5)]])
    expect(out).toBe('\uFEFFA;B\r\n12,5;\r\n0;"x;y"\r\n"di""jo";10/11/2026 08:05')
    expect(aCSV(['A'], [[NaN], [Infinity], ['1.5']])).toBe('\uFEFFA\r\n\r\n\r\n1.5')
  })
})
