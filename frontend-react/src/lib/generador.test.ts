import { describe, expect, it } from 'vitest'
import { estadoGen, promedio, VLL } from './generador'
import type { CampoState } from '../types'

const gen = (o: Partial<CampoState> = {}, valores: CampoState['valores'] = {}): CampoState =>
  ({ name: 'GE 1', kind: 'gen', modelo: 'dse8610', online: true, valores, alarmas: {}, ...o })

describe('estadoGen', () => {
  it('sin comunicación y fuera de servicio mandan (fuera de servicio llega con online false)', () => {
    expect(estadoGen(undefined).id).toBe('sin_com')
    expect(estadoGen(gen({ online: false })).id).toBe('sin_com')
    expect(estadoGen(gen({ online: false, license: 'excedido' })).texto).toBe('FUERA DE LICENCIA')
    expect(estadoGen(gen({ online: false, fueraServicio: true })).id).toBe('fuera_servicio')
  })
  it('alarma: advertencia solo si todas son nivel 2; parada, disparo o sin nivel es falla', () => {
    const rpm = { rpm: 1500, kw: 80 }
    expect(estadoGen(gen({ alarmas: { ALARMA_30: 'Bajo combustible' }, niveles: { ALARMA_30: 2 } }, rpm)).id).toBe('advertencia')
    expect(estadoGen(gen({ alarmas: { ALARMA_30: 'x', ALARMA_31: 'y' }, niveles: { ALARMA_30: 2, ALARMA_31: 3 } }, rpm)).id).toBe('falla')
    expect(estadoGen(gen({ alarmas: { ALARMA_31: 'y' }, niveles: { ALARMA_31: 4 } })).tono).toBe('p1')
    expect(estadoGen(gen({ alarmas: { ALARMA_1: 'z' } })).id).toBe('falla')
  })
  it('en carga > en marcha > automático > parado', () => {
    expect(estadoGen(gen({}, { rpm: 1500, kw: 80 })).id).toBe('carga')
    expect(estadoGen(gen({}, { rpm: 1500, kw: 0.4 })).id).toBe('marcha')
    expect(estadoGen(gen({}, { rpm: 0, kw: 0, modo: 1 })).id).toBe('auto')
    expect(estadoGen(gen({}, { rpm: 200, modo: 1 })).id).toBe('auto')
    expect(estadoGen(gen({}, { rpm: 0, modo: 0 })).id).toBe('parado')
    expect(estadoGen(gen()).id).toBe('parado')
  })
})

describe('promedio', () => {
  it('promedia lo disponible; null sin datos', () => {
    expect(promedio({ vl1l2: 400, vl2l3: 398, vl3l1: null }, VLL)).toBe(399)
    expect(promedio({}, VLL)).toBeNull()
  })
})
