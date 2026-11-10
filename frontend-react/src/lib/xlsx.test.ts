import { describe, it, expect } from 'vitest'
import { buildXlsx } from './xlsx'

describe('buildXlsx', () => {
  it('sanea el nombre de hoja (caracteres prohibidos, 31 máx., vacío)', async () => {
    const txt = await buildXlsx([
      { name: 'Caudal por bomba (L/s)', headers: ['A'], rows: [] },
      { name: '', headers: ['A'], rows: [] },
    ]).text()
    expect(txt).toContain('name="Caudal por bomba (L-s)"')
    expect(txt).toContain('name="Hoja2"')
  })
})
