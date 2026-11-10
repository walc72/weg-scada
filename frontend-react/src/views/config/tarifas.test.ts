import { describe, it, expect } from 'vitest'
import {
  agregarTarifa, asignar, borrarTarifa, borrarVersion, editarVersion, nuevaVersion,
  parseNum, precargarAnde, sitiosDe, vacio, vigente,
} from './tarifas'

const conTarifa = () => {
  const { archivo, id } = agregarTarifa(vacio(), 'ANDE')
  return { a: archivo, id }
}

describe('tarifas', () => {
  it('agregarTarifa: id válido para el backend y versión inicial en blanco con fecha local', () => {
    const { a, id } = conTarifa()
    expect(id).toMatch(/^t-[a-z0-9]{4,20}$/)
    const v = a.tarifas[0].versiones[0]
    expect(v).toMatchObject({ franjas: [], resto: { nombre: 'Fuera de punta', precioKwh: 0 }, potencia: null })
    expect(v.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(vacio().tarifas).toEqual([]) // puro
  })

  it('borrarTarifa limpia la asignación que la usaba', () => {
    const { a, id } = conTarifa()
    const b = asignar(asignar(a, 'Agriplus', { tarifa: id }), 'Otro', { tarifa: 't-otra1' })
    const r = borrarTarifa(b, id)
    expect(r.tarifas).toEqual([])
    expect(r.asignacion.Agriplus.tarifa).toBeNull()
    expect(r.asignacion.Otro.tarifa).toBe('t-otra1')
  })

  it('nuevaVersion copia en profundidad y no comparte referencias', () => {
    const { a, id } = conTarifa()
    const base = editarVersion(a, id, a.tarifas[0].versiones[0].desde, precargarAnde)
    const d0 = base.tarifas[0].versiones[0].desde
    const r = nuevaVersion(base, id, '2099-01-01')
    const [orig, copia] = r.tarifas[0].versiones
    expect(copia.desde).toBe('2099-01-01')
    expect(copia.franjas).toEqual(orig.franjas)
    copia.franjas[0].tramos[0].dias.push(7)
    copia.resto.precioKwh = 99
    expect(orig.franjas[0].tramos[0].dias).toEqual([1, 2, 3, 4, 5, 6])
    expect(orig.resto.precioKwh).toBe(0)
    expect(base.tarifas[0].versiones).toHaveLength(1)
    expect(() => nuevaVersion(base, id, d0)).toThrow('Ya existe una versión con esa fecha')
  })

  it('borrarVersion lanza si es la única', () => {
    const { a, id } = conTarifa()
    const d = a.tarifas[0].versiones[0].desde
    expect(() => borrarVersion(a, id, d)).toThrow()
    const r = borrarVersion(nuevaVersion(a, id, '2099-01-01'), id, '2099-01-01')
    expect(r.tarifas[0].versiones.map(v => v.desde)).toEqual([d])
  })

  it('precargarAnde deja punta L-S 18-22 y conserva el precio de resto', () => {
    const v = precargarAnde({ desde: '2026-01-01', franjas: [], resto: { nombre: 'x', precioKwh: 5 }, potencia: null })
    expect(v.franjas).toEqual([{ nombre: 'Punta', precioKwh: 0, tramos: [{ dias: [1, 2, 3, 4, 5, 6], desde: 18, hasta: 22 }] }])
    expect(v.resto).toEqual({ nombre: 'Fuera de punta', precioKwh: 5 })
  })

  it('sitiosDe: únicos con trim, orden de aparición y vacío al final', () => {
    expect(sitiosDe({
      devices: [{ site: ' Agriplus ' }, { site: 'Agriplus' }, { site: 'Agrocaraya' }],
      meters: [{}],
    })).toEqual(['Agriplus', 'Agrocaraya', ''])
    expect(sitiosDe({})).toEqual([])
  })

  it('vigente elige la última versión con desde <= hoy', () => {
    const { a, id } = conTarifa()
    const d0 = a.tarifas[0].versiones[0].desde
    const t = nuevaVersion(a, id, '2099-01-01').tarifas[0]
    expect(vigente(t, '2099-06-01')?.desde).toBe('2099-01-01')
    expect(vigente(t, '2099-01-01')?.desde).toBe('2099-01-01')
    expect(vigente(t, d0)?.desde).toBe(d0)
    expect(vigente(t, '1999-01-01')).toBeNull()
  })

  it('asignar mezcla el cambio sin tocar el otro campo', () => {
    const { a } = conTarifa()
    const r = asignar(asignar(a, 'S', { tarifa: 't-abcd' }), 'S', { medidor: 'M1' })
    expect(r.asignacion.S).toEqual({ tarifa: 't-abcd', medidor: 'M1' })
    expect(a.asignacion).toEqual({})
  })
  it('parseNum: punto de miles y coma decimal', () => {
    expect(parseNum('41.126')).toBe(41126)
    expect(parseNum('1.234,5')).toBe(1234.5)
    expect(parseNum('331,93')).toBe(331.93)
    expect(parseNum('')).toBeNull()
    expect(parseNum('33a')).toBeNull()
    expect(parseNum('1.234.567,8')).toBe(1234567.8)
    // un punto que no es de miles (decimal en inglés) es inválido, no se lee como miles
    expect(parseNum('331.93')).toBeNull()
    expect(parseNum('0.5')).toBeNull()
  })
})
