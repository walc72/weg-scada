import { describe, expect, it } from 'vitest'
import { nombreArchivo } from './exportar'

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
