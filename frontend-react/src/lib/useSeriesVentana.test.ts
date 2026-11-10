import { describe, it, expect } from 'vitest'
import { usarBuffer } from './useSeriesVentana'

describe('usarBuffer', () => {
  it('modo no live: siempre el buffer', () => {
    expect(usarBuffer(false, false, false)).toBe(true)
  })
  it('live con consulta pendiente o con datos de Influx: no', () => {
    expect(usarBuffer(true, false, false)).toBe(false)
    expect(usarBuffer(true, false, true)).toBe(false)
    expect(usarBuffer(true, true, true)).toBe(false)   // falló el refresco pero queda lo último de Influx
  })
  it('live con Influx caído y nada suyo para mostrar: el buffer', () => {
    expect(usarBuffer(true, true, false)).toBe(true)
  })
})
