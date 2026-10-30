import { describe, expect, it } from 'vitest'
import { aFlow, deFlow, puntosDe, ubicar } from './unifilar'
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
    expect(puntosDe({ tipo: 'reco' })).toEqual(['a', 'b'])
    expect(puntosDe({ tipo: 'bomba' })).toEqual(['a'])
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
