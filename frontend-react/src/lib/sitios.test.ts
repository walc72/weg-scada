import { describe, expect, it } from 'vitest'
import { agruparPorSitio } from './sitios'

const devs = [
  { name: 'B1', site: 'Norte' },
  { name: 'C1', site: 'Sur' },
  { name: 'B2', site: 'Norte' },
  { name: 'X', site: '' },
]
const nombres = (g: ReturnType<typeof agruparPorSitio<{ name: string }>>) => g.map(x => [x.sitio, x.items.map(i => i.name)])

describe('agruparPorSitio', () => {
  it('ordena grupos por primera aparición en la config y conserva el orden de entrada', () => {
    const items = [{ name: 'B2' }, { name: 'C1' }, { name: 'B1' }]
    expect(nombres(agruparPorSitio(items, devs))).toEqual([['Norte', ['B2', 'B1']], ['Sur', ['C1']]])
  })
  it('sin sitio (vacío o fuera de la config) va al final', () => {
    const items = [{ name: 'X' }, { name: 'Nuevo' }, { name: 'C1' }]
    expect(nombres(agruparPorSitio(items, devs))).toEqual([['Sur', ['C1']], [null, ['X', 'Nuevo']]])
  })
  it('omite sitios sin equipos', () => {
    expect(nombres(agruparPorSitio([{ name: 'B1' }], devs))).toEqual([['Norte', ['B1']]])
  })
})
