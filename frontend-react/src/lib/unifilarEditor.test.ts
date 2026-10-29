import { describe, expect, it } from 'vitest'
import type { Dibujo, Unifilar } from './unifilar'
import {
  MAX_PASOS, alternarMostrar, borrar, deshacer, estirarBarra, historialVacio, limpiar, nuevoId, pegar, registrar, rehacer,
} from './unifilarEditor'

const d: Dibujo = {
  id: 'general', nombre: 'Red', tipo: 'general',
  nodos: [
    { id: 'n1', tipo: 'fuente', x: 0, y: 0, rot: 0, nombre: 'F' },
    { id: 'n2', tipo: 'barra', x: 0, y: 100, rot: 0, largo: 100 },
    { id: 'n3', tipo: 'carga', x: 0, y: 200, rot: 0, nombre: 'C' },
  ],
  conexiones: [
    { id: 'c1', desde: ['n1', 'a'], hasta: ['n2', 'p0'] },
    { id: 'c2', desde: ['n2', 'p5'], hasta: ['n3', 'a'] },
  ],
}

describe('historial', () => {
  it('deshace, rehace y una edición nueva borra lo rehacible', () => {
    let h = registrar(historialVacio<number>(), 1)
    h = registrar(h, 2)
    const u = deshacer(h, 3)!
    expect(u.estado).toBe(2)
    const r = rehacer(u.h, 2)!
    expect(r.estado).toBe(3)
    expect(registrar(u.h, 2).futuro).toEqual([])
    expect(deshacer(historialVacio<number>(), 0)).toBeNull()
    expect(rehacer(historialVacio<number>(), 0)).toBeNull()
  })
  it('guarda como máximo 50 pasos', () => {
    let h = historialVacio<number>()
    for (let i = 0; i < 80; i++) h = registrar(h, i)
    expect(h.pasado).toHaveLength(MAX_PASOS)
    expect(h.pasado[0]).toBe(30)
  })
})

describe('edición de dibujo', () => {
  it('nuevoId sigue al mayor usado', () => expect(nuevoId('n', d.nodos)).toBe('n4'))
  it('borrar un nodo borra sus conexiones', () => {
    const r = borrar(d, new Set(['n2']), new Set())
    expect(r.nodos.map(n => n.id)).toEqual(['n1', 'n3'])
    expect(r.conexiones).toEqual([])
  })
  it('pegar usa ids nuevos y copia solo las conexiones internas', () => {
    const { dibujo, nuevos } = pegar(d, [d.nodos[0], d.nodos[1]], [d.conexiones[0]])
    expect(nuevos).toEqual(['n4', 'n5'])
    expect(dibujo.conexiones[2]).toMatchObject({ desde: ['n4', 'a'], hasta: ['n5', 'p0'] })
    expect(dibujo.nodos[3]).toMatchObject({ x: 20, y: 20 })
  })
  it('acortar una barra suelta las conexiones a puntos que ya no existen', () => {
    const r = estirarBarra(d, 'n2', 60) // p0..p3
    expect(r.nodos[1].largo).toBe(60)
    expect(r.conexiones.map(c => c.id)).toEqual(['c1'])
  })
  it('estirar con rot 180 deja p0 fija corriendo x; respeta 40–2000 y grilla de 10', () => {
    const b: Dibujo = { ...d, nodos: [{ id: 'b', tipo: 'barra', x: 100, y: 0, rot: 180, largo: 100 }], conexiones: [] }
    expect(estirarBarra(b, 'b', 153).nodos[0]).toMatchObject({ largo: 150, x: 50 })
    expect(estirarBarra(b, 'b', 5).nodos[0].largo).toBe(40)
    expect(estirarBarra(b, 'b', 9999).nodos[0].largo).toBe(2000)
  })
  it('alternarMostrar agrega y quita fijas y libres', () => {
    let n = alternarMostrar(d.nodos[0], 'ia')
    n = alternarMostrar(n, { med: 'Potencia' })
    expect(n.mostrar).toEqual(['ia', { med: 'Potencia' }])
    expect(alternarMostrar(n, { med: 'Potencia' }).mostrar).toEqual(['ia'])
  })
})

describe('limpiar', () => {
  it('suelta conexiones a puntos inexistentes, bloques de sitio sin dibujo y vinculos desde nodos que no existen', () => {
    const u: Unifilar = {
      version: 1, dibujos: [
        { ...d, nodos: [...d.nodos, { id: 's', tipo: 'sitio', x: 0, y: 0, rot: 0, dibujo: 'borrado' }] },
        { id: 'x', nombre: 'X', tipo: 'sitio', conexiones: [], nodos: [{ id: 'f', tipo: 'fuente', x: 0, y: 0, rot: 0, nombre: 'F', vinculo: { desde: 'n9' } }] },
      ],
    }
    const l = limpiar(u)
    expect(l.dibujos[0].nodos.some(n => n.id === 's')).toBe(false)
    expect(l.dibujos[1].nodos[0].vinculo).toBeUndefined()
    expect(limpiar(l)).toBe(l)
    const ok = limpiar({ version: 1, dibujos: [{ ...d, conexiones: [d.conexiones[0], { id: 'c9', desde: ['n2', 'p99'], hasta: ['n3', 'a'] }] }] })
    expect(ok.dibujos[0].conexiones.map(c => c.id)).toEqual(['c1'])
  })
  it('conserva un vinculo desde un nodo que existe en el general', () => {
    const u: Unifilar = {
      version: 1, dibujos: [d, { id: 'x', nombre: 'X', tipo: 'sitio', conexiones: [], nodos: [{ id: 'f', tipo: 'fuente', x: 0, y: 0, rot: 0, nombre: 'F', vinculo: { desde: 'n3' } }] }],
    }
    expect(limpiar(u)).toBe(u)
  })
})
