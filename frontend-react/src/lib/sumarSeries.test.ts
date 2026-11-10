import { describe, it, expect } from 'vitest'
import { sumarRetenido } from './sumarSeries'

describe('sumarRetenido', () => {
  it('drives con timestamps desfasados: una vez que reportaron los dos, el total suma ambos', () => {
    const r = sumarRetenido({
      A: [{ ts: 0, v: 10 }, { ts: 4000, v: 10 }],
      B: [{ ts: 1500, v: 5 }, { ts: 5500, v: 5 }],
    }, 15000)
    expect(r.map(p => p.v)).toEqual([10, 15, 15, 15])
    expect(r.map(p => p.ts)).toEqual([0, 2000, 4000, 6000])
  })

  it('una serie que deja de reportar sale del total pasado `vence`', () => {
    const A = [0, 2000, 4000, 6000, 8000].map(ts => ({ ts, v: 10 }))
    const r = sumarRetenido({ A, B: [{ ts: 1500, v: 5 }] }, 3000)
    // B cae en el casillero 2000: suma hasta 5000 (2000 + 3000) y después vuelve el valor de A solo
    expect(r.map(p => p.v)).toEqual([10, 15, 15, 10, 10])
  })

  it('el último valor de cada serie en el mismo casillero gana', () => {
    expect(sumarRetenido({ A: [{ ts: 0, v: 1 }, { ts: 900, v: 3 }] }, 15000)).toEqual([{ ts: 0, v: 3 }])
  })
})
