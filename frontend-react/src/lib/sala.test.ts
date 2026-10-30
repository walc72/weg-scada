import { describe, expect, it } from 'vitest'
import { debeEncuadrar, ENCUADRE_MS, QUIETO_MS } from './sala'

describe('debeEncuadrar (modo sala)', () => {
  const t = 10_000_000
  it('cada 5 min si nadie tocó en 2 min', () => {
    expect(debeEncuadrar(t, t - QUIETO_MS, t - ENCUADRE_MS)).toBe(true)
  })
  it('no antes de los 5 min del último encuadre', () => {
    expect(debeEncuadrar(t, t - QUIETO_MS, t - ENCUADRE_MS + 1)).toBe(false)
  })
  it('no si alguien movió el dibujo hace menos de 2 min', () => {
    expect(debeEncuadrar(t, t - QUIETO_MS + 1, t - ENCUADRE_MS)).toBe(false)
  })
  it('sin interacción nunca: alcanza con el tiempo del encuadre', () => {
    expect(debeEncuadrar(t, 0, t - ENCUADRE_MS)).toBe(true)
  })
})
