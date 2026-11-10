import { describe, expect, it } from 'vitest'
import { ultimoValor, TENDENCIA_MIN_MS } from './stale'

const MIN = 60_000
// puntos cada 5 min terminando en t = 0
const datos = [-15, -10, -5, 0].map(m => ({ ts: m * MIN, a: m + 100 }))

describe('ultimoValor (leyenda de tendencia)', () => {
  it('en vivo con dato reciente devuelve el último valor', () => {
    expect(ultimoValor(datos, 'a', 1 * MIN)).toBe(100)
  })
  it('en vivo marca viejo después de 2 pasos', () => {
    expect(ultimoValor(datos, 'a', 10 * MIN)).toBe(100)
    expect(ultimoValor(datos, 'a', 10 * MIN + 1)).toBeNull()
  })
  it('con pasos cortos usa el mínimo de 2 min', () => {
    const rapido = [0, 2000, 4000].map(ts => ({ ts, a: 1 }))
    expect(ultimoValor(rapido, 'a', 4000 + TENDENCIA_MIN_MS)).toBe(1)
    expect(ultimoValor(rapido, 'a', 4001 + TENDENCIA_MIN_MS)).toBeNull()
  })
  it('una serie que dejó de llegar se marca aunque las otras sigan', () => {
    const d = [{ ts: 0, a: 1, b: 2 }, ...[1, 2, 3, 4].map(m => ({ ts: m * MIN, b: 2 }))]
    expect(ultimoValor(d, 'b', 4 * MIN)).toBe(2)
    expect(ultimoValor(d, 'a', 4 * MIN)).toBeNull()
  })
  it('rango fijo (ahora null) nunca descarta por antigüedad', () => {
    expect(ultimoValor(datos, 'a', null)).toBe(100)
  })
  it('sin valores numéricos devuelve null', () => {
    expect(ultimoValor([{ ts: 0, a: 'x' }, { ts: 1, a: NaN }], 'a', null)).toBeNull()
    expect(ultimoValor([], 'a', 0)).toBeNull()
  })
})
