import { describe, expect, it } from 'vitest'
import { estadoGen, modoDe, modoTexto, promedio, VLL } from './generador'
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

describe('modo por modelo', () => {
  it('ComAp IL4 numera distinto: 2 = automático', () => {
    expect(modoTexto('il4', 2)).toBe('Automático')
    expect(modoTexto('dse8610', 2)).toBe('Manual')
    expect(modoTexto(undefined, 1)).toBe('Automático')
    const base = { name: 'g', kind: 'gen', online: true, valores: { rpm: 0, kw: 0, modo: 2 }, alarmas: {} } as any
    expect(estadoGen({ ...base, modelo: 'il4' }).id).toBe('auto')
    expect(estadoGen({ ...base, modelo: 'dse8610' }).id).toBe('parado')
  })
})

describe('modo por coils (SmartGen)', () => {
  it('toma el primer coil de modo activo; sin coils, undefined', () => {
    const st = gen({ modelo: 'hgm6120', senales: { 'Modo stop': false, 'Modo automático': true } }, { rpm: 0, kw: 0 })
    expect(modoDe(st)).toBe(1)
    expect(modoTexto('hgm6120', modoDe(st))).toBe('Automático')
    expect(estadoGen(st).id).toBe('auto')
    expect(modoDe(gen({ modelo: 'hgm6120', senales: { 'Modo manual': true } }))).toBe(2)
    expect(modoDe(gen({ modelo: 'hgm6120' }))).toBeUndefined()
    expect(modoDe(gen({}, { modo: 0 }))).toBe(0)
  })
})
