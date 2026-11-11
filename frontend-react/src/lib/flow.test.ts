import { describe, expect, it } from 'vitest'
import { aLps, aLpsN, desdeLps, fmtFlow, UNIDAD_CAUDAL, volumenCorto } from './flow'

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

describe('volumenCorto', () => {
  it('hasta 999.999 L en litros; desde un millón, en millones de L con 1 decimal', () => {
    expect(volumenCorto(999.999)).toEqual({ valor: 999999, dec: 0, unidad: 'L' })
    expect(volumenCorto(1000)).toEqual({ valor: 1, dec: 1, unidad: 'millones de L' })
    expect(volumenCorto(790376.1)).toEqual({ valor: 790.3761, dec: 1, unidad: 'millones de L' })
    expect(volumenCorto(null)).toBeNull()
    expect(volumenCorto(NaN)).toBeNull()
  })
})
