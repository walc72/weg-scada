import { describe, it, expect } from 'vitest'
import type { AppConfig, CampoConfig } from '../../types'
import { editarEquipo, exigir, guardarEquipo, renombrarEnlace, usadoPor } from './equipos'

const eq = (p: Partial<CampoConfig>): CampoConfig => ({ name: 'x', modelo: 'otro', ip: '1.1.1.1', mapa: [], ...p })
const cfg = (p: Partial<AppConfig>) => ({ devices: [], gateways: [], meters: [], ...p }) as unknown as AppConfig

describe('equipos', () => {
  it('guardarEquipo: alta agrega al final', () => {
    expect(guardarEquipo(undefined, null, eq({ name: 'A' })).map(x => x.name)).toEqual(['A'])
  })

  it('guardarEquipo: edición por nombre original, conserva On/Off y fuera de servicio vigentes', () => {
    const lista = [eq({ name: 'A', enabled: false, fueraServicio: true }), eq({ name: 'B' })]
    const r = guardarEquipo(lista, 'A', eq({ name: 'A2', ip: '2.2.2.2', enabled: true }))
    expect(r[0]).toMatchObject({ name: 'A2', ip: '2.2.2.2', enabled: false, fueraServicio: true })
    expect(r[1]).toBe(lista[1])
    expect(lista[0].name).toBe('A') // puro
  })

  it('editarEquipo: solo el equipo pedido', () => {
    const r = editarEquipo([eq({ name: 'A' }), eq({ name: 'B' })], 'B', x => ({ ...x, enabled: false }))
    expect(r.map(x => x.enabled)).toEqual([undefined, false])
  })

  it('editar o guardar un equipo que ya no existe lanza y no devuelve nada guardable', () => {
    const lista = [eq({ name: 'A' })]
    expect(() => editarEquipo(lista, 'B', x => x)).toThrow('B ya no existe; recargá la página')
    expect(() => guardarEquipo(lista, 'B', eq({ name: 'B' }))).toThrow('B ya no existe; recargá la página')
    expect(() => editarEquipo(undefined, 'A', x => x)).toThrow()
    expect(() => exigir(lista, 'A')).not.toThrow()
    expect(guardarEquipo(lista, null, eq({ name: 'B' })).length).toBe(2) // el alta no exige
  })

  it('usadoPor y renombrarEnlace recorren todas las listas', () => {
    const c = cfg({
      comms: [{ name: 'Torre', tipo: 'airmax', ip: '' }, { name: 'Rut', tipo: 'rut', ip: '', enlace: 'Torre' }],
      generadores: [eq({ name: 'G1', enlace: 'Torre' })],
      meters: [{ name: 'M', enlace: 'Otra' }] as AppConfig['meters'],
    })
    expect(usadoPor(c, 'Torre')).toEqual(['G1', 'Rut'])
    const r = renombrarEnlace(c, 'Torre', 'Norte')
    expect(usadoPor(r, 'Norte')).toEqual(['G1', 'Rut'])
    expect(r.meters[0].enlace).toBe('Otra')
    expect(c.generadores![0].enlace).toBe('Torre') // puro
    expect(renombrarEnlace(c, 'Torre', 'Torre')).toBe(c)
  })
})
