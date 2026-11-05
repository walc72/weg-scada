import { describe, expect, it } from 'vitest'
import { lineas } from './Mediciones'
import type { Vivos } from '../../lib/energizar'
import type { Nodo } from '../../lib/unifilar'
import type { AppConfig, CampoState } from '../../types'

const AHORA = 1_000_000
const nodo: Nodo = { id: 'g', tipo: 'gen', x: 0, y: 0, rot: 0, ref: 'G1', mostrar: ['kw', 'modo'] }
const st = (p: Partial<CampoState>): CampoState =>
  ({ name: 'G1', kind: 'gen', modelo: 'dse8610', online: true, valores: {}, alarmas: {}, _ts: AHORA, ...p } as CampoState)
const vivos = (s: CampoState): Vivos => ({
  campo: new Map([['G1', s]]), meters: new Map(), drives: new Map(), flowmeters: new Map(), comms: new Map(), ahora: AHORA,
  config: { devices: [], meters: [], gateways: [], generadores: [{ name: 'G1', modelo: s.modelo }] } as unknown as AppConfig,
})
const textos = (s: CampoState) => lineas(nodo, vivos(s)).map(l => l.texto)

describe('lineas de un generador', () => {
  it('dse8610: kW y modo en texto', () => {
    expect(textos(st({ valores: { kw: 180, modo: 1 } }))).toEqual(['180 kW', 'Automático'])
  })

  it('hgm6120 sin registro de modo: lo saca del coil activo', () => {
    const t = textos(st({ modelo: 'hgm6120', valores: { kw: 10 }, senales: { 'Modo manual': true } }))
    expect(t[1]).toBe('Manual')
  })

  it('sin comunicación: todo «—»', () => {
    expect(textos(st({ online: false, valores: { kw: 180, modo: 1 } }))).toEqual(['—', '—'])
  })
})
