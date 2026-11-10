import { describe, it, expect } from 'vitest'
import { rangoPeriodo, resumenCosto, type Costos } from './costo'

const F = (nombre: string, kwh: number, costo: number) => ({ nombre, kwh, costo })
const C: Costos = {
  moneda: 'Gs',
  costoBombas: 300,
  sitios: [
    { sitio: 'A', total: 500, franjas: [F('Punta', 10, 200), F('Fuera', 20, 250)] },
    { sitio: 'B', total: null, franjas: [F('Punta', 5, 50)] },
  ],
  bombas: {
    b1: { sitio: 'A', costo: 200, porLitro: 0.5, franjas: [F('Punta', 8, 200)] },
    b2: { sitio: 'B', costo: 100, porLitro: 0.25, franjas: [F('Punta', 5, 100)] },
  },
}

describe('resumenCosto', () => {
  it('todos los sitios: costo de sitios, franjas juntadas, $/L con el volumen total', () => {
    expect(resumenCosto(C, 1, null)).toEqual({ costo: 500, kwh: 35, porLitro: 0.3, franjas: [F('Punta', 15, 250), F('Fuera', 20, 250)] })
  })
  it('un sitio sin tarifa de sitio: cae al costo de sus bombas; $/L con sus litros', () => {
    expect(resumenCosto(C, 1, ['B'])).toEqual({ costo: 100, kwh: 5, porLitro: 0.25, franjas: [F('Punta', 5, 100)] })
  })
  it('varios sitios: $/L ponderado por litros de cada bomba', () => {
    expect(resumenCosto(C, null, ['A', 'B']).porLitro).toBeCloseTo(300 / 800)
  })
  it('sin volumen no hay $/L', () => {
    expect(resumenCosto(C, 0, null).porLitro).toBeNull()
  })
})

describe('rangoPeriodo', () => {
  const ahora = new Date(2026, 10, 10, 15, 30)
  const loc = (iso: string) => { const d = new Date(iso); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()] }
  it('hoy, ayer, 7 días, mes y mes anterior en días locales', () => {
    expect(rangoPeriodo('hoy', ahora).map(loc)).toEqual([[2026, 11, 10, 0], [2026, 11, 11, 0]])
    expect(rangoPeriodo('ayer', ahora).map(loc)).toEqual([[2026, 11, 9, 0], [2026, 11, 10, 0]])
    expect(rangoPeriodo('7d', ahora).map(loc)).toEqual([[2026, 11, 4, 0], [2026, 11, 11, 0]])
    expect(rangoPeriodo('mes', ahora).map(loc)).toEqual([[2026, 11, 1, 0], [2026, 11, 11, 0]])
    expect(rangoPeriodo('mes_anterior', ahora).map(loc)).toEqual([[2026, 10, 1, 0], [2026, 11, 1, 0]])
  })
})
