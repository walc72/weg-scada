import { describe, it, expect } from 'vitest'
import { conPlano, erroresZonas, fusionarCampos, fusionarClaves, zonasConDefaults } from './supervision'

describe('supervision', () => {
  it('fusionarClaves reemplaza solo las claves editadas y borra las vacías', () => {
    const actual: Record<string, Record<string, number>> = { A: { x: 1 }, B: { y: 2 }, C: { z: 3 } }
    expect(fusionarClaves(actual, { A: { x: 9 }, B: {} })).toEqual({ A: { x: 9 }, C: { z: 3 } })
  })

  it('fusionarCampos toca solo los campos indicados y conserva los demás', () => {
    const actual = { B1: { tempHigh: 80, powerHigh: 100 }, B2: { powerHigh: 50 } }
    const out = fusionarCampos(actual, { B1: { tempHigh: 90, powerHigh: 1 }, B2: {}, B3: { tempHigh: Number.NaN } }, ['tempHigh'])
    expect(out).toEqual({ B1: { tempHigh: 90, powerHigh: 100 }, B2: { powerHigh: 50 } })
    expect(fusionarCampos(actual, { B2: {} }, ['powerHigh'])).toEqual({ B1: actual.B1 })
  })

  it('zonasConDefaults completa con el tipo y erroresZonas detecta límites fuera de rango', () => {
    const z = zonasConDefaults('CFW900', { corriente: { green: 200 } })
    expect(z.corriente).toEqual({ min: 0, max: 150, green: 200, yellow: 120 })
    expect(erroresZonas('B1', z)).toEqual(['B1 · corriente: verde = 200 (rango 0–150)'])
    expect(erroresZonas('B1', zonasConDefaults('CFW900', {}))).toEqual([])
  })

  it('conPlano agrega y quita marcas', () => {
    expect(conPlano(undefined, '*', true)).toEqual({ '*': true })
    expect(conPlano({ '*': true }, '*', false)).toEqual({})
  })
})
