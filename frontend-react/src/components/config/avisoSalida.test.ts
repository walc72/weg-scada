import { describe, expect, it } from 'vitest'
import { desregistrar, haySinGuardar, registrar } from './avisoSalida'

describe('avisoSalida', () => {
  it('refleja ediciones sucias registradas', () => {
    expect(haySinGuardar()).toBe(false)
    let sucio = true
    registrar('a', () => sucio)
    expect(haySinGuardar()).toBe(true)
    sucio = false
    expect(haySinGuardar()).toBe(false)
    sucio = true
    desregistrar('a')
    expect(haySinGuardar()).toBe(false)
  })
  it('con dos ids, desregistrar uno deja el otro contando', () => {
    registrar('limpio', () => false)
    registrar('sucio', () => true)
    expect(haySinGuardar()).toBe(true)
    desregistrar('limpio')
    expect(haySinGuardar()).toBe(true)
    desregistrar('sucio')
    expect(haySinGuardar()).toBe(false)
  })
})
