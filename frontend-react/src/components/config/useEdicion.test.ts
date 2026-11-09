import { describe, expect, it } from 'vitest'
import { edicionReducer as r, esSucio } from './useEdicion'

const ini = { original: { a: 1 }, valor: { a: 1 } }

describe('edicionReducer', () => {
  it('editar ensucia y acepta función', () => {
    const s = r(ini, { tipo: 'editar', valor: v => ({ a: v.a + 1 }) })
    expect(s.valor).toEqual({ a: 2 })
    expect(esSucio(s.original, s.valor)).toBe(true)
  })
  it('descartar vuelve al original', () => {
    const s = r(r(ini, { tipo: 'editar', valor: { a: 5 } }), { tipo: 'descartar' })
    expect(esSucio(s.original, s.valor)).toBe(false)
  })
  it('guardado limpia (si fn devuelve false no se despacha y sigue sucio)', () => {
    const e = r(ini, { tipo: 'editar', valor: { a: 5 } })
    expect(esSucio(e.original, e.valor)).toBe(true)
    const g = r(e, { tipo: 'guardado' })
    expect(esSucio(g.original, g.valor)).toBe(false)
    expect(g.valor).toEqual({ a: 5 })
  })
  it('original nuevo sin cambios locales se adopta', () => {
    expect(r(ini, { tipo: 'original', original: { a: 9 } }).valor).toEqual({ a: 9 })
  })
  it('original nuevo con cambios locales los conserva', () => {
    const s = r(r(ini, { tipo: 'editar', valor: { a: 5 } }), { tipo: 'original', original: { a: 9 } })
    expect(s.valor).toEqual({ a: 5 })
    expect(s.original).toEqual({ a: 9 })
  })
})
