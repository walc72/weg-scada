import { describe, it, expect } from 'vitest'
import { armar, tiposDeTrazas } from '../lib/misGraficos'
import { refrescoPropio } from '../components/TrendChart'

describe('tiposDeTrazas', () => {
  it('pide solo lo que dibujan las trazas, sin repetir', () => {
    expect(tiposDeTrazas([{ src: 'meter' }, { src: 'reg' }, { src: 'reco' }])).toEqual(['medidores', 'campo'])
    expect(tiposDeTrazas([{ src: 'drive' }])).toEqual(['bombas'])
    expect(tiposDeTrazas([])).toEqual([])
  })
})

describe('refrescoPropio', () => {
  it('un punto del gráfico, entre 1 y 30 min', () => {
    expect(refrescoPropio(30 * 60_000)).toBe(60_000)
    expect(refrescoPropio(24 * 3600_000)).toBe(216_000)
    expect(refrescoPropio(30 * 86400_000)).toBe(30 * 60_000)
  })
})

describe('armar (Mis gráficos)', () => {
  it('alinea trazas de distintos equipos por _time y aplica la escala', () => {
    const t = '2026-11-03T10:00:00Z'
    const filas = armar({
      drives: [{ _time: t, name: 'B1', current: 50 }, { _time: t, name: 'B2', current: 70 }],
      meters: [{ _time: t, name: 'PM', power: 1500 }],
      campo: [{ _time: t, name: 'R1', kind: 'reg', tap: 3 }, { _time: t, name: 'R1', kind: 'reco', ia: 9 }],
    }, [
      { src: 'drive', name: 'B2', field: 'current', color: '#000' },
      { src: 'meter', name: 'PM', field: 'power', color: '#000' },
      { src: 'reg', name: 'R1', field: 'tap', color: '#000' },
    ])
    expect(filas).toEqual([{ ts: Date.parse(t), t0: 70, t1: 1.5, t2: 3 }])
  })
})
