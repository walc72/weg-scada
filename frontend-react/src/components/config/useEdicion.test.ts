import { describe, expect, it } from 'vitest'
import { edicionReducer as r, esSucio, estadoInicial, guardarCon } from './useEdicion'
import type { AccionEdicion, EstadoEdicion } from './useEdicion'

type V = { a: number }
const ini = estadoInicial<V>({ a: 1 })
const sucio = (s: EstadoEdicion<V>) => esSucio(s.original, s.valor)
const editar = (s: EstadoEdicion<V>, a: number) => r(s, { tipo: 'editar', valor: { a } })

describe('edicionReducer', () => {
  it('editar ensucia y acepta función', () => {
    const s = r(ini, { tipo: 'editar', valor: v => ({ a: v.a + 1 }) })
    expect(s.valor).toEqual({ a: 2 })
    expect(sucio(s)).toBe(true)
  })
  it('descartar vuelve al original', () => {
    expect(sucio(r(editar(ini, 5), { tipo: 'descartar' }))).toBe(false)
  })
  it('guardado limpia', () => {
    const g = r(editar(ini, 5), { tipo: 'guardado', enviado: { a: 5 }, base: ini.visto })
    expect(sucio(g)).toBe(false)
    expect(g.valor).toEqual({ a: 5 })
  })
  it('lo tipeado mientras se guarda sigue sucio', () => {
    const g = r(editar(editar(ini, 5), 6), { tipo: 'guardado', enviado: { a: 5 }, base: ini.visto })
    expect(g.original).toEqual({ a: 5 })
    expect(g.valor).toEqual({ a: 6 })
    expect(sucio(g)).toBe(true)
  })
  it('original nuevo sin cambios locales se adopta', () => {
    expect(r(ini, { tipo: 'original', original: { a: 9 } }).valor).toEqual({ a: 9 })
  })
  it('original nuevo con cambios locales los conserva', () => {
    const s = r(editar(ini, 5), { tipo: 'original', original: { a: 9 } })
    expect(s.valor).toEqual({ a: 5 })
    expect(s.original).toEqual({ a: 9 })
  })
  it('original estructuralmente igual devuelve el mismo estado', () => {
    expect(r(ini, { tipo: 'original', original: { a: 1 } })).toBe(ini)
  })
  it('recarga antes de que fn resuelva: se adopta el original normalizado', () => {
    const s = r(editar(ini, 5), { tipo: 'original', original: { a: 50 } }) // el servidor normaliza
    const g = r(s, { tipo: 'guardado', enviado: { a: 5 }, base: ini.visto })
    expect(g.original).toEqual({ a: 50 })
    expect(g.valor).toEqual({ a: 50 })
  })
  it('recarga primero y el usuario tipeó después de enviar: conserva valor, base nueva', () => {
    const s = editar(r(editar(ini, 5), { tipo: 'original', original: { a: 50 } }), 6)
    const g = r(s, { tipo: 'guardado', enviado: { a: 5 }, base: ini.visto })
    expect(g.original).toEqual({ a: 50 })
    expect(g.valor).toEqual({ a: 6 })
  })
  it('fn resuelve primero y luego llega el original normalizado', () => {
    const g = r(editar(ini, 5), { tipo: 'guardado', enviado: { a: 5 }, base: ini.visto })
    const s = r(g, { tipo: 'original', original: { a: 50 } })
    expect(s.valor).toEqual({ a: 50 })
    expect(sucio(s)).toBe(false)
  })
})

describe('guardarCon', () => {
  it('fn true despacha guardado con lo enviado', async () => {
    const acc: AccionEdicion<V>[] = []
    expect(await guardarCon(async () => true, { a: 5 }, { a: 1 }, x => acc.push(x))).toBe(true)
    expect(acc).toEqual([{ tipo: 'guardado', enviado: { a: 5 }, base: { a: 1 } }])
  })
  it('fn false no despacha y sigue sucio', async () => {
    const acc: AccionEdicion<V>[] = []
    const e = editar(ini, 5)
    expect(await guardarCon(async () => false, e.valor, e.visto, x => acc.push(x))).toBe(false)
    expect(acc).toEqual([])
    expect(sucio(e)).toBe(true)
  })
})
