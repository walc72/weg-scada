import { describe, expect, it } from 'vitest'
import { energizar, estadoEquipo, fasesDeBanco } from './energizar'
import type { Estado, Vivos } from './energizar'
import type { AppConfig, CampoState } from '../types'
import type { Conexion, Dibujo, Nodo } from './unifilar'

const AHORA = 1_000_000
const LIMITE = 8000  // isStale: mínimo 8 s

const nodo = (id: string, tipo: string, extra: Partial<Nodo> = {}): Nodo => ({ id, tipo, x: 0, y: 0, rot: 0, ...extra })
const con = (id: string, d: [string, string], h: [string, string]): Conexion => ({ id, desde: d, hasta: h })
const dib = (nodos: Nodo[], conexiones: Conexion[], extra: Partial<Dibujo> = {}): Dibujo =>
  ({ id: 'general', nombre: 'Red', tipo: 'general', nodos, conexiones, ...extra })

const campo = (name: string, o: Partial<CampoState> = {}): CampoState => ({
  name, kind: 'reco', modelo: 'X', online: true, ts: AHORA, _ts: AHORA, valores: { estado: true }, alarmas: {}, ...o,
})

function vivos(o: { campo?: CampoState[]; meters?: Array<Record<string, unknown>>; reguladores?: Array<Record<string, unknown>> } = {}): Vivos {
  return {
    campo: new Map((o.campo ?? []).map(c => [c.name, c])),
    meters: new Map((o.meters ?? []).map(m => [m.name as string, m as never])),
    drives: new Map(), flowmeters: new Map(), comms: new Map(),
    config: { devices: [], gateways: [], meters: [], reguladores: o.reguladores ?? [] } as unknown as AppConfig,
    ahora: AHORA,
  }
}

// fuente -> reco -> barra -> carga
const lineaReco = (): Dibujo => dib(
  [nodo('f', 'fuente'), nodo('r', 'reco', { ref: 'R1' }), nodo('b', 'barra', { largo: 40 }), nodo('c', 'carga')],
  [con('t1', ['f', 'a'], ['r', 'a']), con('t2', ['r', 'b'], ['b', 'p0']), con('t3', ['b', 'p1'], ['c', 'a'])],
)
const aguasAbajo = (d: Dibujo, v: Vivos): Estado => energizar(d, v).tramos.get('t3')!

describe('reconectador', () => {
  it('cerrado: energiza aguas abajo', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1')] }))).toBe('energizado')
  })
  it('abierto: sin tensión', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { valores: { estado: false } })] }))).toBe('sinTension')
  })
  it('estado 0 numérico es abierto', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { valores: { estado: 0 } })] }))).toBe('sinTension')
  })
  it('disparo manda sobre el estado cerrado', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { alarmas: { DISPARO: 'x' } })] }))).toBe('sinTension')
  })
  it('offline: desconocido', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { online: false })] }))).toBe('desconocido')
  })
  it('excedido de licencia: desconocido', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { license: 'excedido' })] }))).toBe('desconocido')
  })
  it('dato de más de 8 s: desconocido; justo 8 s todavía vale', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { _ts: AHORA - LIMITE - 1 })] }))).toBe('desconocido')
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { _ts: AHORA - LIMITE })] }))).toBe('energizado')
  })
  it('equipo con pollMs 9000: 20 s es fresco, 30 s es viejo', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { pollMs: 9000, _ts: AHORA - 20000 })] }))).toBe('energizado')
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { pollMs: 9000, _ts: AHORA - 30000 })] }))).toBe('desconocido')
  })
  it('usa la hora de llegada: ts del server muy desfasado no importa', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { ts: AHORA - 3_600_000 })] }))).toBe('energizado')
  })
  it('sinEnlace: desconocido', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { online: false, sinEnlace: 'Radio 1' })] }))).toBe('desconocido')
  })
  it('estado sin dato: desconocido', () => {
    expect(aguasAbajo(lineaReco(), vivos({ campo: [campo('R1', { valores: { estado: null } })] }))).toBe('desconocido')
  })
  it('ref inexistente: desconocido, nunca sin tensión', () => {
    expect(aguasAbajo(lineaReco(), vivos())).toBe('desconocido')
  })
  it('el tramo aguas arriba sigue energizado aunque el reco no comunique', () => {
    expect(energizar(lineaReco(), vivos()).tramos.get('t1')).toBe('energizado')
  })
})

describe('barra, seccionador y lazos', () => {
  it('barra con dos fuentes: una vinculada sin tensión no le quita la energía', () => {
    const d = dib(
      [nodo('f1', 'fuente'), nodo('f2', 'fuente', { vinculo: { ref: 'M', kind: 'medidor', nominal: 100 } }), nodo('b', 'barra', { largo: 60 }), nodo('c', 'carga')],
      [con('t1', ['f1', 'a'], ['b', 'p0']), con('t2', ['f2', 'a'], ['b', 'p3']), con('t3', ['b', 'p1'], ['c', 'a'])],
    )
    const v = vivos({ meters: [{ name: 'M', online: true, voltage: 0, _ts: AHORA }] })
    const r = energizar(d, v)
    expect(r.tramos.get('t3')).toBe('energizado')
    expect(r.tramos.get('t2')).toBe('energizado')
  })
  it('seccionador abierto corta, cerrado pasa', () => {
    const mk = (cerrado: boolean) => dib(
      [nodo('f', 'fuente'), nodo('s', 'seccionador', { nombre: 'S', cerrado }), nodo('c', 'carga')],
      [con('t1', ['f', 'a'], ['s', 'a']), con('t2', ['s', 'b'], ['c', 'a'])],
    )
    expect(energizar(mk(false), vivos()).tramos.get('t2')).toBe('sinTension')
    expect(energizar(mk(true), vivos()).tramos.get('t2')).toBe('energizado')
  })
  it('fusible abierto corta', () => {
    const d = dib([nodo('f', 'fuente'), nodo('s', 'fusible', { nombre: 'F', cerrado: false }), nodo('c', 'carga')],
      [con('t1', ['f', 'a'], ['s', 'a']), con('t2', ['s', 'b'], ['c', 'a'])])
    expect(energizar(d, vivos()).tramos.get('t2')).toBe('sinTension')
  })
  it('lazo: termina y energiza', () => {
    const d = dib(
      [nodo('f', 'fuente'), nodo('t1', 'trafo', { nombre: 'T1' }), nodo('t2', 'trafo', { nombre: 'T2' }), nodo('b', 'barra', { largo: 40 })],
      [con('c1', ['f', 'a'], ['b', 'p0']), con('c2', ['b', 'p1'], ['t1', 'a']), con('c3', ['t1', 'b'], ['t2', 'a']), con('c4', ['t2', 'b'], ['b', 'p2'])],
    )
    const r = energizar(d, vivos())
    for (const id of ['c1', 'c2', 'c3', 'c4']) expect(r.tramos.get(id)).toBe('energizado')
  })
  it('precedencia: energizado gana a desconocido, desconocido a sin tensión', () => {
    // barra alimentada por un reco desconocido y por una fuente directa
    const d = dib(
      [nodo('f1', 'fuente'), nodo('f2', 'fuente'), nodo('r', 'reco', { ref: 'R1' }), nodo('b', 'barra', { largo: 40 })],
      [con('t1', ['f1', 'a'], ['r', 'a']), con('t2', ['r', 'b'], ['b', 'p0']), con('t3', ['f2', 'a'], ['b', 'p1'])],
    )
    expect(energizar(d, vivos()).tramos.get('t2')).toBe('energizado')
    // sin la segunda fuente: desconocido
    const solo = dib(d.nodos.filter(n => n.id !== 'f2'), d.conexiones.filter(c => c.id !== 't3'))
    expect(energizar(solo, vivos()).tramos.get('t2')).toBe('desconocido')
    // sin ninguna fuente: sin tensión
    const nada = dib(solo.nodos.filter(n => n.id !== 'f1'), [con('t2', ['r', 'b'], ['b', 'p0'])])
    expect(energizar(nada, vivos()).tramos.get('t2')).toBe('sinTension')
  })
})

describe('fuente vinculada', () => {
  const d = (vinculo: Nodo['vinculo']) => dib(
    [nodo('f', 'fuente', { vinculo }), nodo('c', 'carga')], [con('t', ['f', 'a'], ['c', 'a'])])
  const med = (voltage: number, o: Record<string, unknown> = {}) =>
    vivos({ meters: [{ name: 'M', online: true, voltage, _ts: AHORA, ...o }] })
  const v = { ref: 'M', kind: 'medidor', nominal: 1000 } as const

  it('medidor sobre el umbral (50% por defecto)', () => {
    expect(energizar(d(v), med(500)).tramos.get('t')).toBe('energizado')
  })
  it('medidor bajo el umbral', () => {
    expect(energizar(d(v), med(499)).tramos.get('t')).toBe('sinTension')
  })
  it('umbralPct propio', () => {
    expect(energizar(d({ ...v, umbralPct: 90 }), med(800)).tramos.get('t')).toBe('sinTension')
  })
  it('medidor sin dato, offline o inexistente: desconocido', () => {
    expect(energizar(d(v), vivos()).tramos.get('t')).toBe('desconocido')
    expect(energizar(d(v), med(1000, { online: false })).tramos.get('t')).toBe('desconocido')
    expect(energizar(d(v), med(1000, { _ts: AHORA - 10 * LIMITE })).tramos.get('t')).toBe('desconocido')
  })
  it('regulador suelto por ref usa su v, o la medición libre con med', () => {
    const reg = campo('G1', { kind: 'reg', valores: { v: 100 }, extras: { 'Tensión fuente': 21000 } })
    expect(energizar(d({ ref: 'G1', kind: 'reg', nominal: 21000 }), vivos({ campo: [reg] })).tramos.get('t')).toBe('sinTension')
    expect(energizar(d({ ref: 'G1', kind: 'reg', nominal: 21000, med: 'Tensión fuente' }), vivos({ campo: [reg] })).tramos.get('t')).toBe('energizado')
  })
  it('regulador con valor nulo: desconocido', () => {
    const reg = campo('G1', { kind: 'reg', valores: { v: null } })
    expect(energizar(d({ ref: 'G1', kind: 'reg', nominal: 21000 }), vivos({ campo: [reg] })).tramos.get('t')).toBe('desconocido')
  })

  describe('banco por med «Tensión fuente»', () => {
    const vin = { banco: 'B1', kind: 'reg', nominal: 21000, med: 'Tensión fuente' } as const
    const regs = [{ name: 'A', banco: 'B1' }, { name: 'B', banco: 'B1' }, { name: 'C', banco: 'B1' }, { name: 'X', banco: 'otro' }]
    const fase = (name: string, tf: number | null, o: Partial<CampoState> = {}) =>
      campo(name, { kind: 'reg', extras: { 'Tensión fuente': tf }, ...o })
    it('todas las fases en línea: energizado si alguna supera el umbral', () => {
      const vv = vivos({ reguladores: regs, campo: [fase('A', 21000), fase('B', 0), fase('C', 0)] })
      expect(energizar(d(vin), vv).tramos.get('t')).toBe('energizado')
    })
    it('todas bajo el umbral: sin tensión', () => {
      const vv = vivos({ reguladores: regs, campo: [fase('A', 100), fase('B', 0), fase('C', 50)] })
      expect(energizar(d(vin), vv).tramos.get('t')).toBe('sinTension')
    })
    it('una sola fase en línea decide con su dato (las otras no cuentan)', () => {
      const alta = vivos({ reguladores: regs, campo: [fase('A', 21000), fase('B', 0, { online: false }), fase('C', 0, { _ts: 0 })] })
      expect(energizar(d(vin), alta).tramos.get('t')).toBe('energizado')
      const baja = vivos({ reguladores: regs, campo: [fase('A', 10), fase('B', 21000, { online: false })] })
      expect(energizar(d(vin), baja).tramos.get('t')).toBe('sinTension')
    })
    it('ninguna fase en línea: desconocido', () => {
      const vv = vivos({ reguladores: regs, campo: [fase('A', 21000, { online: false }), fase('B', 21000, { license: 'excedido' })] })
      expect(energizar(d(vin), vv).tramos.get('t')).toBe('desconocido')
    })
    it('banco inexistente: desconocido', () => {
      expect(energizar(d({ ...vin, banco: 'nada' }), vivos({ reguladores: regs })).tramos.get('t')).toBe('desconocido')
    })
    it('regulador deshabilitado no es fase', () => {
      const rs = [{ name: 'A', banco: 'B1', enabled: false }]
      expect(energizar(d(vin), vivos({ reguladores: rs, campo: [fase('A', 21000)] })).tramos.get('t')).toBe('desconocido')
    })
  })

  describe('de sitio: { desde }', () => {
    const general = dib([nodo('s', 'fuente'), nodo('c', 'carga')], [con('g', ['s', 'a'], ['c', 'a'])])
    const sitio = dib([nodo('f', 'fuente', { vinculo: { desde: 's' } }), nodo('c', 'carga')], [con('t', ['f', 'a'], ['c', 'a'])], { id: 'x', tipo: 'sitio' })
    const conRes = (g: Dibujo) => ({ dibujo: g, resultado: energizar(g, vivos()) })
    it('toma el estado del nodo del general', () => {
      expect(energizar(sitio, vivos(), conRes(general)).tramos.get('t')).toBe('energizado')
      const apagado = dib([nodo('s', 'seccionador', { nombre: 'S', cerrado: false })], [])
      expect(energizar(sitio, vivos(), { dibujo: apagado, resultado: { tramos: new Map(), nodos: new Map([['s', 'sinTension']]), puntos: new Map() } }).tramos.get('t')).toBe('sinTension')
    })
    it('sin general o nodo inexistente: desconocido', () => {
      expect(energizar(sitio, vivos()).tramos.get('t')).toBe('desconocido')
      const otro = dib([], [])
      expect(energizar(sitio, vivos(), conRes(otro)).tramos.get('t')).toBe('desconocido')
    })
  })
})

describe('regulador en la línea', () => {
  const d = (reg: Partial<Nodo>) => dib(
    [nodo('f', 'fuente'), nodo('g', 'reg', reg), nodo('c', 'carga')],
    [con('t1', ['f', 'a'], ['g', 'a']), con('t2', ['g', 'b'], ['c', 'a'])])
  it('con ref (existente o no): paso libre', () => {
    expect(energizar(d({ ref: 'G1' }), vivos()).tramos.get('t2')).toBe('energizado')
    expect(energizar(d({ ref: 'G1' }), vivos({ campo: [campo('G1', { kind: 'reg', online: false })] })).tramos.get('t2')).toBe('energizado')
  })
  it('con banco (existente o no): paso libre', () => {
    expect(energizar(d({ banco: 'B1' }), vivos()).tramos.get('t2')).toBe('energizado')
    expect(energizar(d({ banco: 'B1' }), vivos({ reguladores: [{ name: 'A', banco: 'B1' }] })).tramos.get('t2')).toBe('energizado')
  })
  it('medidor inexistente: paso libre', () => {
    const dm = dib([nodo('f', 'fuente'), nodo('m', 'medidor', { ref: 'nada' }), nodo('c', 'carga')],
      [con('t1', ['f', 'a'], ['m', 'a']), con('t2', ['m', 'b'], ['c', 'a'])])
    expect(energizar(dm, vivos()).tramos.get('t2')).toBe('energizado')
  })
})

describe('estadoEquipo', () => {
  const regs = [{ name: 'A', banco: 'B1' }, { name: 'B', banco: 'B1' }, { name: 'C', banco: 'B1' }]
  const f = (name: string, o: Partial<CampoState> = {}) => campo(name, { kind: 'reg', ...o })
  const banco = nodo('g', 'reg', { banco: 'B1' })

  it('banco 3/3 en línea', () => {
    const e = estadoEquipo(banco, vivos({ reguladores: regs, campo: [f('A'), f('B'), f('C')] }))
    expect(e.online).toBe('si')
  })
  it('banco 2/3: parcial y alarmas = unión de las fases', () => {
    const e = estadoEquipo(banco, vivos({
      reguladores: regs,
      campo: [f('A', { alarmas: { FALLA: 'a' } }), f('B', { alarmas: { FALLA: 'b', CORRIENTE_ALTA: 'c' } }), f('C', { online: false })],
    }))
    expect(e.online).toBe('parcial')
    expect(e.alarmas.sort()).toEqual(['a', 'b', 'c'])
  })
  it('banco 0/3: no, con sinEnlace de una fase', () => {
    const e = estadoEquipo(banco, vivos({ reguladores: regs, campo: [f('A', { online: false, sinEnlace: 'Radio 1' }), f('B', { online: false })] }))
    expect(e.online).toBe('no')
    expect(e.sinEnlace).toBe('Radio 1')
  })
  it('alarmas: textos, deduplicados', () => {
    const e = estadoEquipo(banco, vivos({ reguladores: regs, campo: [f('A', { alarmas: { ALARMA_1: 'Falla RG1' } }), f('B', { alarmas: { ALARMA_1: 'Bloqueo RG2' } }), f('C', { alarmas: { ALARMA_1: 'Falla RG1' } })] }))
    expect(e.alarmas).toEqual(['Falla RG1', 'Bloqueo RG2'])
  })
  it('comm: excedido o dato viejo = no', () => {
    const n = nodo('k', 'comm', { ref: 'L' })
    const c = (o: object) => ({ comms: new Map([['L', { name: 'L', online: true, _ts: AHORA, ...o }]]) })
    expect(estadoEquipo(n, { ...vivos(), ...c({}) } as never).online).toBe('si')
    expect(estadoEquipo(n, { ...vivos(), ...c({ license: 'excedido' }) } as never).online).toBe('no')
    expect(estadoEquipo(n, { ...vivos(), ...c({ _ts: 0 }) } as never).online).toBe('no')
  })
  it('banco inexistente: faltante', () => {
    expect(estadoEquipo(nodo('g', 'reg', { banco: 'nada' }), vivos()).faltante).toBe(true)
  })
  it('reco: en línea / excedido / viejo / sinEnlace / inexistente', () => {
    const n = nodo('r', 'reco', { ref: 'R1' })
    expect(estadoEquipo(n, vivos({ campo: [campo('R1')] })).online).toBe('si')
    expect(estadoEquipo(n, vivos({ campo: [campo('R1', { license: 'excedido' })] })).online).toBe('no')
    expect(estadoEquipo(n, vivos({ campo: [campo('R1', { _ts: AHORA - 2 * LIMITE })] })).online).toBe('no')
    expect(estadoEquipo(n, vivos({ campo: [campo('R1', { online: false, sinEnlace: 'Radio 1' })] })).sinEnlace).toBe('Radio 1')
    expect(estadoEquipo(n, vivos()).faltante).toBe(true)
    expect(estadoEquipo(n, vivos({ campo: [campo('R1', { alarmas: { DISPARO: 'Disparo' } })] })).alarmas).toEqual(['Disparo'])
  })
})

describe('fasesDeBanco', () => {
  it('habilitados con ese banco, en orden de la lista', () => {
    const v = vivos({ reguladores: [{ name: 'A', banco: 'B1' }, { name: 'X', banco: 'B2' }, { name: 'B', banco: 'B1', enabled: false }, { name: 'C', banco: 'B1', enabled: true }] })
    expect(fasesDeBanco(v.config, 'B1').map(f => f.name)).toEqual(['A', 'C'])
  })
})
