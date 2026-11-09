import { describe, it, expect } from 'vitest'
import { sumarRetenido } from './sumarSeries'

describe('sumarRetenido', () => {
  it('drives con timestamps desfasados: una vez que reportaron los dos, el total suma ambos', () => {
    const r = sumarRetenido({
      A: [{ ts: 0, v: 10 }, { ts: 4000, v: 10 }],
      B: [{ ts: 1500, v: 5 }, { ts: 5500, v: 5 }],
    })
    expect(r.map(p => p.v)).toEqual([10, 15, 15, 15])
    expect(r.map(p => p.ts)).toEqual([0, 2000, 4000, 6000])
  })

  it('el último valor de cada serie en el mismo casillero gana', () => {
    expect(sumarRetenido({ A: [{ ts: 0, v: 1 }, { ts: 900, v: 3 }] })).toEqual([{ ts: 0, v: 3 }])
  })
})
