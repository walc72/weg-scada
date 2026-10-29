import { describe, expect, it } from 'vitest'
import { aFlow, deFlow, puntosDe } from './unifilar'
import type { Dibujo } from './unifilar'

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
