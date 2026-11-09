import { describe, it, expect } from 'vitest'
import { sanearLayout, layoutEfectivo, mover, moverA, nuevoItem, DEFECTO_CODIGO, type CtxGadgets, type Layout } from './gadgets'

const ctx = (extra: Partial<CtxGadgets> = {}, mods: string[] = ['medidores', 'caudales']): CtxGadgets => ({
  hasModule: (m) => mods.includes(m),
  medidores: ['M1', 'M2'],
  sitios: ['A', 'B'],
  graficos: ['g1'],
  ...extra,
})
const L = (items: unknown[]) => ({ v: 1, items })

describe('sanearLayout', () => {
  it('descarta tipos desconocidos y entradas inválidas', () => {
    expect(sanearLayout(L([{ id: 'x', tipo: 'nope', ancho: 4 }]), ctx()).items).toEqual([])
    expect(sanearLayout(null, ctx()).items).toEqual([])
    expect(sanearLayout({ v: 2, items: [] }, ctx()).items).toEqual([])
  })

  it('descarta sin licencia y anula medidor inexistente', () => {
    const it = { id: 'm', tipo: 'medidor', ancho: 4, opciones: { medidor: 'M1' } }
    expect(sanearLayout(L([it]), ctx({}, [])).items).toEqual([])
    const r = sanearLayout(L([{ ...it, opciones: { medidor: 'ZZ' } }]), ctx())
    expect(r.items[0].opciones).toEqual({ medidor: null })
  })

  it('no múltiples: queda el primero; múltiples: ambos', () => {
    const k = (id: string) => ({ id, tipo: 'kpis', ancho: 12 })
    const t = (id: string) => ({ id, tipo: 'tendencia', ancho: 6 })
    expect(sanearLayout(L([k('a'), k('b')]), ctx()).items.map((i) => i.id)).toEqual(['a'])
    expect(sanearLayout(L([t('a'), t('b')]), ctx()).items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('corrige anchos no permitidos', () => {
    const r = sanearLayout(L([{ id: 'a', tipo: 'alarmas', ancho: 6 }, { id: 'b', tipo: 'bombas', ancho: 4 }]), ctx())
    expect(r.items.map((i) => i.ancho)).toEqual([12, 8])
  })

  it('regenera ids repetidos', () => {
    const r = sanearLayout(L([{ id: 'x', tipo: 'tendencia', ancho: 6 }, { id: 'x', tipo: 'tendencia', ancho: 6 }]), ctx())
    expect(r.items[0].id).toBe('x')
    expect(r.items[1].id).not.toBe('x')
  })

  it('sanea opciones de bombas y tendencia', () => {
    const r = sanearLayout(
      L([
        { id: 'b', tipo: 'bombas', ancho: 8, opciones: { sitios: ['X'] } },
        { id: 't', tipo: 'tendencia', ancho: 6, opciones: { magnitud: 'caudal', ventanaH: 3 } },
      ]),
      ctx({}, []),
    )
    expect(r.items[0].opciones).toEqual({ sitios: null })
    expect(r.items[1].opciones).toEqual({ magnitud: 'potencia', ventanaH: 1 })
    const ok = sanearLayout(L([{ id: 'b', tipo: 'bombas', ancho: 8, opciones: { sitios: ['B', 'X'] } }]), ctx())
    expect(ok.items[0].opciones).toEqual({ sitios: ['B'] })
  })

  it('conserva misGrafico con gráfico inexistente y defaults sin opciones', () => {
    const r = sanearLayout(L([{ id: 'g', tipo: 'misGrafico', ancho: 6, opciones: { grafico: 'gone' } }, { id: 'k', tipo: 'kpis', ancho: 12 }]), ctx())
    expect(r.items[0].opciones).toEqual({ grafico: 'gone' })
    expect(r.items[1].opciones).toEqual({ ocultos: [] })
  })

  it('no muta la entrada', () => {
    const e = L([{ id: 'x', tipo: 'bombas', ancho: 4, opciones: { sitios: ['X'] } }, { id: 'x', tipo: 'nope', ancho: 1 }])
    const antes = structuredClone(e)
    sanearLayout(e, ctx())
    expect(e).toEqual(antes)
  })
})

describe('layoutEfectivo', () => {
  it('cae a DEFECTO_CODIGO saneado y usa el predeterminado', () => {
    expect(layoutEfectivo(null, null, ctx())).toEqual(sanearLayout(DEFECTO_CODIGO, ctx()))
    const D: Layout = { v: 1, items: [{ id: 'd', tipo: 'alarmas', ancho: 12 }] }
    expect(layoutEfectivo(null, D, ctx()).items.map((i) => i.id)).toEqual(['d'])
  })
})

describe('mover / moverA / nuevoItem', () => {
  const l: Layout = { v: 1, items: ['a', 'b', 'c'].map((id) => ({ id, tipo: 'tendencia', ancho: 6 })) }
  const ids = (x: Layout) => x.items.map((i) => i.id)
  it('mover en bordes no cambia', () => {
    expect(ids(mover(l, 'a', -1))).toEqual(['a', 'b', 'c'])
    expect(ids(mover(l, 'c', 1))).toEqual(['a', 'b', 'c'])
    expect(ids(mover(l, 'b', 1))).toEqual(['a', 'c', 'b'])
  })
  it('moverA reordena', () => {
    expect(ids(moverA(l, 0, 2))).toEqual(['b', 'c', 'a'])
  })
  it('nuevoItem usa ancho por defecto e id único', () => {
    const a = nuevoItem('medidor')
    expect(a.ancho).toBe(4)
    expect(a.id).toMatch(/^medidor-/)
    expect(nuevoItem('medidor').id).not.toBe(a.id)
  })
})
