import { describe, expect, it } from 'vitest'
import { resumenEquipo } from './resumenEquipo'
import type { Vivos } from './energizar'
import type { Nodo } from './unifilar'
import type { AppConfig, CampoState } from '../types'

const AHORA = 1_000_000
const nodo = (tipo: string, extra: Partial<Nodo> = {}): Nodo => ({ id: 'n', tipo, x: 0, y: 0, rot: 0, ...extra })
const campo = (name: string, o: Partial<CampoState> = {}): CampoState => ({
  name, kind: 'reg', modelo: 'MR', online: true, ts: AHORA, _ts: AHORA, valores: {}, alarmas: {}, ...o,
})
const drive = (o: Record<string, unknown> = {}) => ({
  name: 'SAER 1', type: 'CFW900', online: true, running: true, fault: false, faultText: '', statusText: 'Marcha',
  current: 12.34, frequency: 50, power: 7.5, igbtTemp: 41.4, scrTemp: 55, runHours: 1234, _ts: AHORA, ...o,
})

function vivos(o: { campo?: CampoState[]; drives?: Record<string, unknown>[]; config?: Record<string, unknown> } = {}): Vivos {
  return {
    campo: new Map((o.campo ?? []).map(c => [c.name, c])),
    meters: new Map(), flowmeters: new Map(), comms: new Map(),
    drives: new Map((o.drives ?? []).map(d => [d.name as string, d as never])),
    config: { devices: [{ name: 'SAER 1' }], gateways: [], meters: [], ...o.config } as unknown as AppConfig,
    ahora: AHORA,
  }
}
const op = { generadores: false }

describe('resumenEquipo', () => {
  it('bomba en marcha: 5 valores y chip EN MARCHA', () => {
    const r = resumenEquipo(nodo('bomba', { ref: 'SAER 1' }), vivos({ drives: [drive()] }), op)
    expect(r.valores.map(x => x.etiqueta)).toEqual(['Corriente', 'Frecuencia', 'Potencia', 'Temperatura', 'Horas de marcha'])
    expect(r.estado).toEqual({ tono: 'run', texto: 'EN MARCHA' })
    expect(r.detalle).toBe('/motor/' + encodeURIComponent('SAER 1'))
  })
  it('sin comunicación: chip SIN COMUNICACIÓN y todo en —', () => {
    const r = resumenEquipo(nodo('bomba', { ref: 'SAER 1' }), vivos({ drives: [drive({ online: false })] }), op)
    expect(r.estado.tono).toBe('com')
    expect(r.estado.texto).toBe('SIN COMUNICACIÓN')
    expect(r.valores.every(x => x.valor === '—')).toBe(true)
    expect(r.alarmas).toEqual([])
  })
  it('banco: una fila por fase, fase caída en — y chip PARCIAL', () => {
    const regs = ['R1', 'R2', 'R3'].map(name => ({ name, banco: 'B1', modelo: 'MR' }))
    const st = (n: string) => campo(n, { valores: { v: 13200, tap: 3, fp: 0.98 } })
    const r = resumenEquipo(nodo('reg', { banco: 'B1' }), vivos({ campo: [st('R1'), st('R3')], config: { reguladores: regs } }), op)
    expect(r.banco!.map(f => f.fase)).toEqual(['A', 'B', 'C'])
    expect(r.banco![1].v).toBe('—')
    expect(r.estado).toEqual({ tono: 'com', texto: 'PARCIAL' })
    expect(r.detalle).toBe('/campo/R1')
  })
  it('regulador con alarma de nivel 2 → p3 y chip ALARMA', () => {
    const cfg = { name: 'R1', modelo: 'MR' }
    const st = campo('R1', { valores: { v: 100, tap: 2, i: 5, fp: 1 }, alarmas: { A0: 'Tap alto' }, niveles: { A0: 2 } })
    const r = resumenEquipo(nodo('reg', { ref: 'R1' }), vivos({ campo: [st], config: { reguladores: [cfg] } }), op)
    expect(r.alarmas).toEqual([{ texto: 'Tap alto', prioridad: 'p3' }])
    expect(r.estado).toEqual({ tono: 'p1', texto: 'ALARMA' })
    expect(r.valores[1]).toEqual({ etiqueta: 'Tap', valor: '+2', unidad: '' })
  })
  it('reco disparado: chip DISPARO y corrientes A/B/C', () => {
    const st = campo('RC', { kind: 'reco', valores: { ia: 10, ib: 11, ic: 12 }, alarmas: { DISPARO: 'Disparo' } })
    const r = resumenEquipo(nodo('reco', { ref: 'RC' }), vivos({ campo: [st], config: { reconectadores: [{ name: 'RC', modelo: 'X' }] } }), op)
    expect(r.estado).toEqual({ tono: 'p1', texto: 'DISPARO' })
    expect(r.valores.map(x => x.etiqueta)).toEqual(['Corriente A', 'Corriente B', 'Corriente C'])
  })
  it('generador sin módulo: detalle /campo/…', () => {
    const st = campo('G1', { kind: 'gen', valores: { rpm: 1500, kw: 20, vl1l2: 400 } })
    const v = vivos({ campo: [st], config: { generadores: [{ name: 'G1', modelo: 'X' }] } })
    expect(resumenEquipo(nodo('gen', { ref: 'G1' }), v, op).detalle).toBe('/campo/G1')
    expect(resumenEquipo(nodo('gen', { ref: 'G1' }), v, { generadores: true }).detalle).toBe('/generadores/G1')
  })
  it('equipo inexistente: existe false y NO ENCONTRADO', () => {
    const r = resumenEquipo(nodo('bomba', { ref: 'XX' }), vivos(), op)
    expect(r.existe).toBe(false)
    expect(r.estado).toEqual({ tono: 'p3', texto: 'NO ENCONTRADO' })
    expect(r.valores).toEqual([])
    expect(r.detalle).toBeNull()
  })
})
