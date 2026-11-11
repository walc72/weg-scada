import { describe, it, expect } from 'vitest'
import { igualesProps } from './TrendChart'

describe('igualesProps (memo de TrendChart)', () => {
  const data = [{ ts: 1, a: 2 }]
  const base = { title: 'T', data, series: [{ key: 'a', label: 'A', color: '#111' }], unit: 'A', yDomain: [0, 'auto'] as [number, 'auto'] }
  it('ignora rangeFetch recreado y literales iguales de series/yDomain', () => {
    expect(igualesProps({ ...base, rangeFetch: async () => [] }, { ...base, series: [{ key: 'a', label: 'A', color: '#111' }], yDomain: [0, 'auto'], rangeFetch: async () => [] })).toBe(true)
  })
  it('redibuja si cambian los datos, una serie o aparece/desaparece rangeFetch', () => {
    expect(igualesProps(base, { ...base, data: [...data] })).toBe(false)
    expect(igualesProps(base, { ...base, series: [{ key: 'a', label: 'A', color: '#222' }] })).toBe(false)
    expect(igualesProps(base, { ...base, rangeFetch: async () => [] })).toBe(false)
  })
})
