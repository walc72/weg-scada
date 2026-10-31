import { describe, expect, it } from 'vitest'
import { bornes, ladoPorDefecto, tramoCorto } from './bornes'
import type { Nodo } from './unifilar'

const n = (tipo: string, extra: Partial<Nodo> = {}): Nodo => ({ id: 'x', tipo, x: 0, y: 0, rot: 0, ...extra })

describe('bornes', () => {
  it('lados por defecto: a arriba, b abajo, fuente abajo, s/m derecha, d izquierda (comm abajo)', () => {
    expect(ladoPorDefecto(n('reco'), 'a')).toBe('arriba')
    expect(ladoPorDefecto(n('reco'), 'b')).toBe('abajo')
    expect(ladoPorDefecto(n('fuente'), 'a')).toBe('abajo')
    expect(ladoPorDefecto(n('medidor'), 'm')).toBe('derecha')
    expect(ladoPorDefecto(n('medidor'), 'd')).toBe('izquierda')
    expect(ladoPorDefecto(n('comm'), 'd')).toBe('abajo')
  })
  it('posición sobre el borde del símbolo de 48 px y hacia dónde sale', () => {
    expect(bornes(n('reco'))).toEqual([
      { id: 'a', lado: 'arriba', x: 24, y: 0, dx: 0, dy: -1, movido: false },
      { id: 'b', lado: 'abajo', x: 24, y: 48, dx: 0, dy: 1, movido: false },
      { id: 'd', lado: 'izquierda', x: 0, y: 24, dx: -1, dy: 0, movido: false },
    ])
  })
  it('un lado elegido mueve el borne y lo marca', () => {
    const [d] = bornes(n('comm', { lados: { d: 'derecha' } }))
    expect(d).toEqual({ id: 'd', lado: 'derecha', x: 48, y: 24, dx: 1, dy: 0, movido: true })
  })
  it('la barra conserva sus puntos a lo largo y no admite lados', () => {
    expect(bornes(n('barra', { largo: 40, lados: { p0: 'arriba' } as never })).map(b => [b.id, b.x, b.y])).toEqual([['p0', 0, 5], ['p1', 20, 5], ['p2', 40, 5]])
  })
  it('con escala, los bornes van sobre el borde del símbolo agrandado', () => {
    expect(bornes(n('reco', { escala: 2 })).map(b => [b.id, b.x, b.y])).toEqual([['a', 48, 0], ['b', 48, 96], ['d', 0, 48]])
    expect(bornes(n('comm', { escala: 0.5, lados: { d: 'derecha' } }))[0]).toMatchObject({ x: 24, y: 12, movido: true })
  })
  it('tramo corto hacia el lado del borne', () => {
    expect(tramoCorto('arriba')).toBe('M24 0V10')
    expect(tramoCorto('izquierda')).toBe('M0 24H10')
  })
})
