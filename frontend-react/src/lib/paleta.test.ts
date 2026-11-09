import { describe, expect, test } from 'vitest'
import { aplicarPaleta, colorDeSerie, faseDeIndice, paletaEfectiva } from './paleta'

// style falso: vitest corre sin DOM
function estiloFalso() {
  const m = new Map<string, string>()
  return {
    setProperty: (k: string, v: string | null) => void m.set(k, v ?? ''),
    removeProperty: (k: string) => (m.delete(k), ''),
    getPropertyValue: (k: string) => m.get(k) ?? '',
  }
}

describe('paleta', () => {
  test('regla fase → magnitud → serie', () => {
    expect(colorDeSerie({ fase: 'B', magnitud: 'corriente', indice: 3 })).toBe('var(--fase-b)')
    expect(colorDeSerie({ magnitud: 'corriente', indice: 3 })).toBe('var(--mag-corriente)')
    expect(colorDeSerie({ indice: 9 })).toBe('var(--serie-2)')
  })
  test('faseDeIndice es cíclico', () => {
    expect([0, 1, 2, 3].map(faseDeIndice)).toEqual(['A', 'B', 'C', 'A'])
  })
  test('paletaEfectiva mezcla y descarta inválidos', () => {
    const p = paletaEfectiva({ fase: { a: '#112233', b: 'rojo' }, series: [null, '#abcdef'] })
    expect(p.fase.a).toBe('#112233'); expect(p.fase.b).toBe('#2BA59A')
    expect(p.series[1]).toBe('#abcdef'); expect(p.series[0]).toBe('#4C8BD6')
  })
  test('aplicarPaleta escribe solo lo personalizado y lo quita al restaurar', () => {
    const st = estiloFalso()
    aplicarPaleta({ magnitud: { tension: '#000000' }, series: [null, '#abcdef'] }, st)
    expect(st.getPropertyValue('--mag-tension')).toBe('#000000')
    expect(st.getPropertyValue('--serie-2')).toBe('#abcdef')
    expect(st.getPropertyValue('--serie-1')).toBe('')
    aplicarPaleta(null, st)
    expect(st.getPropertyValue('--mag-tension')).toBe('')
    expect(st.getPropertyValue('--serie-2')).toBe('')
  })
})
