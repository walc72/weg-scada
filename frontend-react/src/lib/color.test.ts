import { describe, expect, test } from 'vitest'
import { hexAHsl, textoSobre } from './color'

describe('color de la marca', () => {
  test('hex a hsl', () => {
    expect(hexAHsl('#2563eb')).toBe('221 83% 53%')
    expect(hexAHsl('#ffffff')).toBe('0 0% 100%')
    expect(hexAHsl('#e87722')).toBe('26 81% 52%')
  })
  test('texto blanco sobre oscuro, oscuro sobre claro', () => {
    expect(textoSobre('#2563eb')).toBe('0 0% 100%')
    expect(textoSobre('#ffeb3b')).toBe('217 29% 15%')
  })
})
