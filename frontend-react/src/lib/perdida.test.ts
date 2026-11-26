import { describe, expect, it } from 'vitest'
import { energiaAcumulada, perdidaDeFilas, potenciasDeFilas } from './perdida'

const t = (min: number) => new Date(Date.UTC(2026, 10, 26, 12, min)).toISOString()
const filas = [
  { _time: t(0), name: 'A', power: 100_000 }, { _time: t(0), name: 'B', power: 40_000 }, { _time: t(0), name: 'C', power: 10_000 },
  { _time: t(5), name: 'A', power: 120_000 }, { _time: t(5), name: 'C', power: 10_000 },            // falta B: no es pérdida
  { _time: t(10), name: 'B', power: 50_000 }, { _time: t(10), name: 'C', power: 10_000 },           // falta el principal
  { _time: t(15), name: 'A', power: 110_000 }, { _time: t(15), name: 'B', power: 30_000 }, { _time: t(15), name: 'C', power: 20_000 },
]

describe('perdidaDeFilas', () => {
  it('principal − restan en kW, solo donde miden todos', () => {
    expect(perdidaDeFilas(filas, 'A', ['B', 'C'])).toEqual([
      { ts: Date.parse(t(0)), loss: 50 },
      { ts: Date.parse(t(15)), loss: 60 },
    ])
  })
})

describe('energiaAcumulada', () => {
  it('trapecios en kWh; un salto de más de 1 h no se integra', () => {
    const h = 3600_000
    expect(energiaAcumulada([{ ts: 0, loss: 10 }, { ts: h, loss: 30 }, { ts: 3 * h, loss: 30 }]).map(x => x.energy)).toEqual([0, 20, 20])
  })
})

describe('potenciasDeFilas', () => {
  it('una fila por _time con cada medidor en kW; sin dato no es 0', () => {
    const r = potenciasDeFilas(filas)
    expect(r).toHaveLength(4)
    expect(r[1]).toEqual({ ts: Date.parse(t(5)), A: 120, C: 10 })
  })
})
