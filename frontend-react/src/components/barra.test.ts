import { describe, it, expect } from 'vitest'
import { barra } from './HalfGauge'

describe('barra (zonas del indicador)', () => {
  it('normal: verde hasta green, amarillo hasta yellow, rojo arriba', () => {
    const z = { min: 0, max: 100, green: 60, yellow: 85 }
    expect(barra({ ...z, value: 50 }).nivel).toBe('ok')
    expect(barra({ ...z, value: 70 }).nivel).toBe('warn')
    expect(barra({ ...z, value: 90 }).nivel).toBe('bad')
    expect(barra({ ...z, value: 50 }).pos).toBe(50)
    expect(barra({ ...z, value: 50 }).bandW).toBe(60)
  })
  it('redLow: por debajo es falla', () => {
    expect(barra({ min: 0, max: 500, redLow: 350, green: 420, yellow: 440, value: 300 }).nivel).toBe('bad')
    expect(barra({ min: 0, max: 500, redLow: 350, green: 420, yellow: 440, value: 400 }).nivel).toBe('ok')
  })
  it('invert: alto es bueno', () => {
    expect(barra({ min: 0, max: 100, green: 30, yellow: 60, invert: true, value: 80 }).nivel).toBe('ok')
    expect(barra({ min: 0, max: 100, green: 30, yellow: 60, invert: true, value: 10 }).nivel).toBe('bad')
  })
  it('bipolar (FP): mide la magnitud', () => {
    expect(barra({ min: 0, max: 1, green: 0, yellow: 0, bipolar: true, value: -0.95 }).nivel).toBe('ok')
    expect(barra({ min: 0, max: 1, green: 0, yellow: 0, bipolar: true, value: 0.6 }).nivel).toBe('bad')
  })
  it('valores fuera de rango no rompen (clamp)', () => {
    const b = barra({ min: 0, max: 100, green: 730920, yellow: 5, value: 1e9 })
    expect(b.pos).toBe(100)
    expect(b.bandW).toBeLessThanOrEqual(100)
  })
})
