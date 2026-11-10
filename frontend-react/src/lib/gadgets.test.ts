import { describe, it, expect } from 'vitest'
import { sanearLayout, layoutEfectivo, mover, moverA, nuevoItem, disponiblesParaAgregar, vecinoPorTecla, paraPredeterminado, sitiosConfig, DEFECTO_CODIGO, type CtxGadgets, type Layout } from './gadgets'

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
  it('layout malformado cae al siguiente; vacío válido queda vacío', () => {
    const D: Layout = { v: 1, items: [{ id: 'd', tipo: 'alarmas', ancho: 12 }] }
    const mal = { v: 2 } as unknown as Layout
    expect(layoutEfectivo(mal, D, ctx())).toEqual(sanearLayout(D, ctx()))
    expect(layoutEfectivo({ v: 1, items: [] }, D, ctx()).items).toEqual([])
    expect(layoutEfectivo(mal, mal, ctx())).toEqual(sanearLayout(DEFECTO_CODIGO, ctx()))
  })
  it('tendencia caudal se conserva con módulo caudales', () => {
    const r = sanearLayout(L([{ id: 't', tipo: 'tendencia', ancho: 6, opciones: { magnitud: 'caudal', ventanaH: 24 } }]), ctx())
    expect(r.items[0].opciones).toEqual({ magnitud: 'caudal', ventanaH: 24 })
  })
  it('nuevoItem rellena opciones por defecto', () => {
    expect(nuevoItem('tendencia').opciones).toEqual({ magnitud: 'potencia', ventanaH: 1 })
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

describe('disponiblesParaAgregar', () => {
  const lay = sanearLayout(L([{ id: 'k', tipo: 'kpis', ancho: 12 }, { id: 't', tipo: 'tendencia', ancho: 6 }]), ctx())
  const d = disponiblesParaAgregar(lay, ctx())
  const de = (tipo: string) => d.find((x) => x.tipo === tipo)
  it('sin licencia no aparece', () => expect(de('generadores')).toBeUndefined())
  it('no múltiple ya presente: deshabilitado; múltiple presente o ausente: habilitado', () => {
    expect(de('kpis')?.deshabilitado).toBe(true)
    expect(de('tendencia')?.deshabilitado).toBe(false)
    expect(de('bombas')?.deshabilitado).toBe(false)
  })
})

describe('disponiblesParaAgregar · misGrafico', () => {
  const vacio = { v: 1 as const, items: [] }
  it('sin gráficos del usuario: deshabilitado; con gráficos: habilitado', () => {
    expect(disponiblesParaAgregar(vacio, ctx({ graficos: [] })).find((x) => x.tipo === 'misGrafico')?.deshabilitado).toBe(true)
    expect(disponiblesParaAgregar(vacio, ctx()).find((x) => x.tipo === 'misGrafico')?.deshabilitado).toBe(false)
  })
})

describe('vecinoPorTecla', () => {
  const ids = ['a', 'b', 'c']
  it('derecha/abajo van al siguiente y izquierda/arriba al anterior', () => {
    expect(vecinoPorTecla(ids, 'b', 'ArrowRight')).toBe('c')
    expect(vecinoPorTecla(ids, 'b', 'ArrowDown')).toBe('c')
    expect(vecinoPorTecla(ids, 'b', 'ArrowLeft')).toBe('a')
    expect(vecinoPorTecla(ids, 'b', 'ArrowUp')).toBe('a')
  })
  it('en los extremos, tecla desconocida o id desconocido devuelve null', () => {
    expect(vecinoPorTecla(ids, 'c', 'ArrowRight')).toBeNull()
    expect(vecinoPorTecla(ids, 'a', 'ArrowUp')).toBeNull()
    expect(vecinoPorTecla(ids, 'b', 'KeyX')).toBeNull()
    expect(vecinoPorTecla(ids, 'z', 'ArrowRight')).toBeNull()
  })
})

describe('paraPredeterminado / sitiosConfig', () => {
  it('quita los Mis gráficos (personales) y deja el resto', () => {
    const l: Layout = { v: 1, items: [nuevoItem('alarmas'), nuevoItem('misGrafico'), nuevoItem('kpis')] }
    expect(paraPredeterminado(l).items.map(x => x.tipo)).toEqual(['alarmas', 'kpis'])
  })
  it('sitios de la config: únicos, sin vacíos', () => {
    expect(sitiosConfig([{ site: ' A ' }, { site: 'A' }, { site: '' }, {}, { site: 'B' }])).toEqual(['A', 'B'])
  })
})

describe('gadget gauges', () => {
  it('es múltiple y sanea su lista', () => {
    const g = (id: string, gauges: unknown) => ({ id, tipo: 'gauges', ancho: 6, opciones: { gauges } })
    const r = sanearLayout(L([g('a', [{ src: 'drive', name: 'B1', field: 'current' }, { src: 'x' }]), g('b', 'nope')]), ctx())
    expect(r.items.map((i) => i.opciones)).toEqual([{ gauges: [{ src: 'drive', name: 'B1', field: 'current' }], estilo: 'arco', tamano: 'M' }, { gauges: [], estilo: 'arco', tamano: 'M' }])
    expect(nuevoItem('gauges').opciones).toEqual({ gauges: [], estilo: 'arco', tamano: 'M' })
  })
})

describe('opciones de personalización', () => {
  const op = (tipo: string, opciones: unknown, c = ctx()) => sanearLayout(L([{ id: 'x', tipo, ancho: 4, opciones }]), c).items[0]?.opciones

  it('título propio en cualquier gadget: recortado a 40, vacío no se guarda', () => {
    expect(op('alarmas', { titulo: '  Mis alarmas ' })).toEqual({ titulo: 'Mis alarmas' })
    expect(op('alarmas', { titulo: '   ' })).toEqual({})
    expect((op('kpis', { titulo: 'x'.repeat(60) })!.titulo as string).length).toBe(40)
    expect(op('kpis', { titulo: 5 })).toEqual({ ocultos: [] })
  })

  it('gauges: estilo arco/línea y tamaño S/M/L con defecto arco M', () => {
    expect(op('gauges', {})).toMatchObject({ estilo: 'arco', tamano: 'M' })
    expect(op('gauges', { estilo: 'linea', tamano: 'L' })).toMatchObject({ estilo: 'linea', tamano: 'L' })
    expect(op('gauges', { estilo: 'x', tamano: 'XL' })).toMatchObject({ estilo: 'arco', tamano: 'M' })
  })

  it('costo: períodos e indicadores válidos en orden; sitios inexistentes fuera', () => {
    expect(op('costo', undefined)).toEqual({ periodos: ['hoy', 'mes'], indicadores: ['costo', 'porLitro'], sitios: null })
    expect(op('costo', { periodos: ['mes_anterior', 'hoy', 'zz'], indicadores: ['franjas', 'kwh'], sitios: ['B', 'X'] }))
      .toEqual({ periodos: ['hoy', 'mes_anterior'], indicadores: ['kwh', 'franjas'], sitios: ['B'] })
    expect(op('costo', { periodos: [], sitios: ['X'] })).toMatchObject({ periodos: ['hoy', 'mes'], sitios: null })
  })

  it('bomba: conserva el nombre aunque no exista; vista y campos', () => {
    expect(op('bomba', undefined)).toEqual({ bomba: '', vista: 'completa', campos: ['estado', 'corriente', 'potencia', 'frecuencia', 'horas', 'energia'] })
    expect(op('bomba', { bomba: 'SAER 9', vista: 'compacta', campos: ['potencia', 'estado'] }))
      .toEqual({ bomba: 'SAER 9', vista: 'compacta', campos: ['estado', 'potencia'] })
  })

  it('caudales: solo con licencia; lista null = todos; unidad L/s por defecto', () => {
    expect(op('caudales', {}, ctx({}, []))).toBeUndefined()
    expect(op('caudales', {})).toEqual({ caudalimetros: null, columnas: ['caudal', 'total', 'estado'], unidad: 'lps' })
    expect(op('caudales', { caudalimetros: ['C1', 3, ''], columnas: ['estado'], unidad: 'm3h' }))
      .toEqual({ caudalimetros: ['C1'], columnas: ['estado'], unidad: 'm3h' })
  })
})
