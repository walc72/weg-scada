import { describe, expect, it } from 'vitest'
import { aFlow, conManiobra, conexionValida, deFlow, esDatos, esMedicion, nombreVisible, ponerLetra, ptAPx, ptLetra, puntosDe, pxAPt, ubicar, zoomLetra } from './unifilar'
import type { Dibujo, Unifilar } from './unifilar'
import type { AppConfig } from '../types'

const dibujo: Dibujo = {
  id: 'general', nombre: 'Red general', tipo: 'general',
  nodos: [
    { id: 'f', tipo: 'fuente', x: 0, y: 0, rot: 0, nombre: 'Red', vinculo: { banco: 'B1', kind: 'reg', med: 'Tensión fuente', nominal: 21000, umbralPct: 60 } },
    { id: 'b', tipo: 'barra', x: 40, y: 80, rot: 90, largo: 160 },
    { id: 'r', tipo: 'reco', x: 120, y: 200, rot: 270, ref: 'R1', mostrar: ['ia', { med: 'Potencia activa' }, { senal: 'Motor' }] },
    { id: 's', tipo: 'sitio', x: 300, y: 40, rot: 0, dibujo: 'x' },
  ],
  conexiones: [
    { id: 'c1', desde: ['f', 'a'], hasta: ['b', 'p0'] },
    { id: 'c2', desde: ['b', 'p8'], hasta: ['r', 'a'] },
  ],
}

describe('aFlow / deFlow', () => {
  it('ida y vuelta sin pérdida', () => {
    const { nodes, edges } = aFlow(dibujo)
    expect(deFlow(dibujo, nodes, edges)).toEqual(dibujo)
  })
  it('refleja la posición movida en el lienzo y la barra estirada', () => {
    const { nodes, edges } = aFlow(dibujo)
    nodes[1].position = { x: 50, y: 90 }
    nodes[1].data = { nodo: { ...nodes[1].data.nodo, largo: 200 } }
    const d = deFlow(dibujo, nodes, edges)
    expect(d.nodos[1]).toMatchObject({ x: 50, y: 90, largo: 200, rot: 90 })
  })
  it('conexiones se mapean a handles de React Flow', () => {
    expect(aFlow(dibujo).edges[0]).toEqual({ id: 'c1', source: 'f', sourceHandle: 'a', target: 'b', targetHandle: 'p0' })
  })
})

describe('puntosDe', () => {
  it('barra de largo 100 = p0…p5', () => {
    expect(puntosDe({ tipo: 'barra', largo: 100 })).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5'])
  })
  it('por tipo', () => {
    expect(puntosDe({ tipo: 'reco' })).toEqual(['a', 'b', 'd'])
    expect(puntosDe({ tipo: 'bomba' })).toEqual(['a', 'd'])
    expect(puntosDe({ tipo: 'texto' })).toEqual([])
    expect(puntosDe({ tipo: 'barra' })).toEqual([])
  })
})

describe('deFlow con aristas sin punto de conexión', () => {
  it('descarta las que no tienen sourceHandle o targetHandle (React Flow los tipa string | null)', () => {
    const { nodes, edges } = aFlow(dibujo)
    const e = [...edges, { id: 'x1', source: 'f', sourceHandle: null, target: 'b', targetHandle: 'p1' },
      { id: 'x2', source: 'f', sourceHandle: 'a', target: 'b', targetHandle: undefined }]
    expect(deFlow(dibujo, nodes, e).conexiones).toEqual(dibujo.conexiones)
  })
})

describe('ubicar', () => {
  const eq = (id: string, tipo: string, extra: object) => ({ id, tipo, x: 0, y: 0, rot: 0 as const, ...extra })
  const u: Unifilar = {
    version: 1,
    dibujos: [
      { id: 's1', nombre: 'Norte', tipo: 'sitio', nodos: [eq('a', 'bomba', { ref: 'P1' }), eq('b', 'bomba', { ref: 'P2' })], conexiones: [] },
      { id: 'general', nombre: 'Red', tipo: 'general', nodos: [eq('g', 'bomba', { ref: 'P1' }), eq('r', 'reg', { banco: 'B' }), eq('f', 'fuente', { vinculo: { ref: 'P2', kind: 'medidor', nominal: 1 } })], conexiones: [] },
    ],
  }
  const cfg = { reguladores: [{ name: 'G1', banco: 'B' }, { name: 'G9', banco: 'B', enabled: false }] } as unknown as AppConfig

  it('el general primero', () => expect(ubicar(u, 'P1', cfg)).toEqual({ dibujo: 'general', nodo: 'g' }))
  it('solo en un sitio (una fuente vinculada no cuenta)', () => expect(ubicar(u, 'P2', cfg)).toEqual({ dibujo: 's1', nodo: 'b' }))
  it('regulador de un banco: el símbolo del banco', () => expect(ubicar(u, 'G1', cfg)).toEqual({ dibujo: 'general', nodo: 'r' }))
  it('no dibujado o deshabilitado: nada', () => {
    expect(ubicar(u, 'X', cfg)).toBeNull()
    expect(ubicar(u, 'G9', cfg)).toBeNull()
  })
})

describe('puntos de medición', () => {
  it('TC, TP y medidor', () => {
    expect(puntosDe({ tipo: 'tc' })).toEqual(['a', 'b', 's'])
    expect(puntosDe({ tipo: 'tp' })).toEqual(['a', 's'])
    expect(puntosDe({ tipo: 'medidor' })).toEqual(['a', 'b', 'm', 'd'])
  })
  it('conexionValida: s↔m sí; s↔línea, s↔s y m↔m no; línea↔línea sí', () => {
    expect(conexionValida('s', 'm')).toBe(true)
    expect(conexionValida('m', 's')).toBe(true)
    expect(conexionValida('s', 'a')).toBe(false)
    expect(conexionValida('p0', 'm')).toBe(false)
    expect(conexionValida('s', 's')).toBe(false)
    expect(conexionValida('m', 'm')).toBe(false)
    expect(conexionValida('a', 'p2')).toBe(true)
    expect(esMedicion({ id: 'x', desde: ['t', 's'], hasta: ['m', 'm'] })).toBe(true)
    expect(esMedicion({ id: 'x', desde: ['t', 'a'], hasta: ['m', 'b'] })).toBe(false)
  })
})

describe('puntos de datos', () => {
  it('d en comm y en los equipos; solo d↔d', () => {
    expect(puntosDe({ tipo: 'comm' })).toEqual(['d'])
    expect(puntosDe({ tipo: 'medidor' })).toEqual(['a', 'b', 'm', 'd'])
    expect(puntosDe({ tipo: 'bomba' })).toEqual(['a', 'd'])
    expect(conexionValida('d', 'd')).toBe(true)
    expect(conexionValida('d', 'a')).toBe(false)
    expect(conexionValida('d', 'm')).toBe(false)
    expect(esDatos({ id: 'x', desde: ['r', 'd'], hasta: ['m', 'd'] })).toBe(true)
  })
})

describe('tamaño de letra en pt', () => {
  const n = { id: 'a', tipo: 'trafo', x: 0, y: 0, rot: 0 as const }
  it('8 pt es el normal (sin campo); los nombres viejos se ven igual y se muestran en pt', () => {
    expect(ponerLetra(n, 8)).toBe(n)
    expect(ponerLetra(n, 14).letra).toBe(14)
    expect(ponerLetra({ ...n, letra: 14 }, 8).letra).toBeUndefined()
    expect(ponerLetra({ ...n, tipo: 'texto' }, 14).letra).toBeUndefined()
    expect(zoomLetra('grande')).toBe(1.3)
    expect(ptLetra('grande')).toBe(11)
    expect(ptLetra(undefined)).toBe(8)
    expect(zoomLetra(16)).toBeCloseTo(21.33 / 11, 3)
  })
  it('texto suelto: pt ↔ px', () => {
    expect(ptAPx(12)).toBe(16)
    expect(pxAPt(16)).toBe(12)
    expect(pxAPt(ptAPx(10))).toBe(10)
  })
})

describe('nombre visible del nodo', () => {
  const cfg = { meters: [{ name: 'PM8000', ui: { title: 'Línea Exclusiva' } }, { name: 'PM2' }], meterNames: { PM2: 'Medidor Norte' }, devices: [{ name: 'SAER 1', displayName: 'Bomba 1' }] } as unknown as AppConfig
  it('el del dibujo primero; si no, título del medidor, nombre del medidor o nombre de la bomba; si no, el ID', () => {
    expect(nombreVisible({ tipo: 'medidor', ref: 'PM8000', nombre: 'Propio' }, cfg)).toBe('Propio')
    expect(nombreVisible({ tipo: 'medidor', ref: 'PM8000' }, cfg)).toBe('Línea Exclusiva')
    expect(nombreVisible({ tipo: 'medidor', ref: 'PM2' }, cfg)).toBe('Medidor Norte')
    expect(nombreVisible({ tipo: 'bomba', ref: 'SAER 1' }, cfg)).toBe('Bomba 1')
    expect(nombreVisible({ tipo: 'reco', ref: 'R1' }, cfg)).toBe('R1')
  })
})

describe('maniobra de seccionador (solo visual)', () => {
  it('invierte cerrado solo en ese nodo de ese dibujo', () => {
    const data = { version: 1, colores: 'portal', dibujos: [
      { id: 'general', nombre: 'G', tipo: 'general', nodos: [{ id: 's1', tipo: 'seccionador', x: 0, y: 0, rot: 0, cerrado: true }, { id: 's2', tipo: 'seccionador', x: 0, y: 0, rot: 0, cerrado: true }], conexiones: [] },
    ] } as unknown as Unifilar
    const r = conManiobra(data, 'general', 's1')
    expect(r.dibujos[0].nodos.map(n => n.cerrado)).toEqual([false, true])
    expect(data.dibujos[0].nodos[0].cerrado).toBe(true)
  })
})
