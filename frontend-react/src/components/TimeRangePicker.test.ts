import { describe, expect, it } from 'vitest'
import { alejar, etiquetaRango, fmtDuracion, fmtRango } from './TimeRangePicker'

const H = 3_600_000
const D = 24 * H
const now = new Date(2026, 10, 25, 17, 16, 31).getTime() // 25/11 17:16:31 (hora local)

describe('etiquetas del rango', () => {
  it('duración que no es preset: legible, nunca en segundos', () => {
    expect(fmtDuracion(2 * D)).toBe('Últimas 48 horas')
    expect(fmtDuracion(4 * D)).toBe('Últimos 4 días')
    expect(fmtDuracion(45 * 60_000)).toBe('Últimos 45 min')
    expect(fmtDuracion(D)).toBe('Últimas 24 horas')
  })

  it('24 h desplazada al pasado muestra las fechas, no la misma hora dos veces', () => {
    expect(etiquetaRango({ windowMs: D, endOffset: -6 * H }, now)).toBe('24/11 11:16 – 25/11 11:16')
  })

  it('mismo día: hoy sin fecha, otro día con fecha', () => {
    expect(fmtRango(now - 2 * H, now, now)).toBe('15:16 – 17:16')
    expect(fmtRango(now - D - 2 * H, now - D, now)).toBe('24/11 15:16 – 17:16')
  })
})

describe('alejar', () => {
  it('sube por los presets y mantiene la posición', () => {
    expect(alejar({ windowMs: D, endOffset: 0 }, now)).toEqual({ windowMs: 7 * D, endOffset: 0 })
    expect(alejar({ windowMs: 7 * H, endOffset: -H }, now)).toEqual({ windowMs: D, endOffset: -H })
    expect(alejar({ windowMs: 30 * D, endOffset: 0 }, now)).toEqual({ windowMs: 60 * D, endOffset: 0 })
  })

  it('rango fijo: crece alrededor del centro sin pasarse de ahora', () => {
    const r = alejar({ windowMs: 0, endOffset: 0, fixedStart: now - 2 * D - H, fixedEnd: now - 2 * D }, now)
    expect(r.fixedEnd! - r.fixedStart!).toBe(7 * H)
    expect(alejar({ windowMs: 0, endOffset: 0, fixedStart: now - H, fixedEnd: now }, now).fixedEnd).toBe(now)
  })
})
