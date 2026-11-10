import { describe, expect, it } from 'vitest'
import { nombreArchivo, filasGrafico, nombreExport } from './exportar'

describe('nombreArchivo', () => {
  const f = new Date(2026, 9, 30, 9, 5)  // 30/10/2026 09:05 hora local
  it('nombre en minúsculas sin acentos y fecha local', () => {
    expect(nombreArchivo('Red general', f)).toBe('unifilar-red-general-2026-10-30-0905.png')
    expect(nombreArchivo('Estación Ñandú', f)).toBe('unifilar-estacion-nandu-2026-10-30-0905.png')
  })
  it('caracteres raros y vacío', () => {
    expect(nombreArchivo('  Planta / Bombeo #2  ', f)).toBe('unifilar-planta-bombeo-2-2026-10-30-0905.png')
    expect(nombreArchivo('???', f)).toBe('unifilar-2026-10-30-0905.png')
  })
})

describe('filasGrafico', () => {
  it('encabezados con unidad, filas ordenadas por ts y null donde falta la serie', () => {
    const r = filasGrafico([{ ts: 2, a: 1 }, { ts: 1, a: 3, b: 4 }], [{ key: 'a', label: 'Q1' }, { key: 'b', label: 'Q2' }], 'L/s')
    expect(r.headers).toEqual(['Fecha/Hora', 'Q1 (L/s)', 'Q2 (L/s)'])
    expect(r.rows).toEqual([[new Date(1), 3, 4], [new Date(2), 1, null]])
  })
  it('sin unidad y salta filas con ts inválido', () => {
    const r = filasGrafico([{ ts: NaN, a: 1 }, { ts: 'x', a: 2 }, { ts: 5, a: 7 }], [{ key: 'a', label: 'Q1' }])
    expect(r.headers).toEqual(['Fecha/Hora', 'Q1'])
    expect(r.rows).toEqual([[new Date(5), 7]])
  })
})

describe('nombreExport', () => {
  it('slug del título y fecha local', () => {
    expect(nombreExport('Caudal · Pozo 3', new Date(2026, 10, 10, 8, 5), 'csv')).toBe('caudal-pozo-3_2026-11-10-0805.csv')
    expect(nombreExport('???', new Date(2026, 10, 10, 8, 5), 'xlsx')).toBe('grafico_2026-11-10-0805.xlsx')
  })
})
