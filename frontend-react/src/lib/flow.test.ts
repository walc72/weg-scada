import { describe, expect, it } from 'vitest'
import { aLps, aLpsN, desdeLps, fmtFlow, UNIDAD_CAUDAL } from './flow'

describe('caudal en L/s', () => {
  it('convierte m³/h ↔ L/s', () => {
    expect(aLps(3.6)).toBe(1)
    expect(aLps(360)).toBeCloseTo(100)
    expect(desdeLps(aLps(320))).toBeCloseTo(320)
    expect(aLpsN(null)).toBeNull()
    expect(aLpsN(undefined)).toBeUndefined()
    expect(UNIDAD_CAUDAL).toBe('L/s')
  })
  it('formatea con 1 decimal y — sin dato', () => {
    expect(fmtFlow(320)).toBe('88.9')
    expect(fmtFlow(0)).toBe('0.0')
    expect(fmtFlow(null)).toBe('—')
    expect(fmtFlow(NaN)).toBe('—')
  })
})
