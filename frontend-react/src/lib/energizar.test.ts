import { describe, expect, it } from 'vitest'
import { energizar, energizarTodos, estadoEnlace, estadoEquipo, fasesDeBanco, kwSale, listaAlarmas, resumenEstado } from './energizar'
import type { Estado, Vivos } from './energizar'
import type { AppConfig, CampoState } from '../types'
import type { Conexion, Dibujo, Nodo, Unifilar } from './unifilar'

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
      expect(energizar(sitio, vivos(), { dibujo: apagado, resultado: { tramos: new Map(), nodos: new Map([['s', 'sinTension']]), puntos: new Map(), sentido: new Map() } }).tramos.get('t')).toBe('sinTension')
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

describe('desde: aguas abajo del nodo general', () => {
  const general = lineaReco()
  const sitio = dib([nodo('f', 'fuente', { vinculo: { desde: 'r' } }), nodo('c', 'carga')], [con('t', ['f', 'a'], ['c', 'a'])], { id: 'x', tipo: 'sitio' })
  const sitioDe = (v: Vivos) => energizar(sitio, v, { dibujo: general, resultado: energizar(general, v) }).tramos.get('t')
  it('reco abierto con línea viva: sin tensión', () => expect(sitioDe(vivos({ campo: [campo('R1', { valores: { estado: false } })] }))).toBe('sinTension'))
  it('reco desconocido: desconocido', () => expect(sitioDe(vivos())).toBe('desconocido'))
  it('reco cerrado: energizado', () => expect(sitioDe(vivos({ campo: [campo('R1')] }))).toBe('energizado'))
})

describe('comms: ciclo de 30 s', () => {
  const nc = nodo('k', 'comm', { ref: 'L' })
  const en = (edad: number) => estadoEquipo(nc, { ...vivos(), comms: new Map([['L', { name: 'L', online: true, _ts: AHORA - edad } as never]]) }).online
  it('40 s: fresco; 100 s: viejo', () => { expect(en(40000)).toBe('si'); expect(en(100000)).toBe('no') })
})

describe('banco: alarmas solo de fases vivas', () => {
  it('ignora fase vieja', () => {
    const regs = [{ name: 'A', banco: 'B1' }, { name: 'B', banco: 'B1' }]
    const v = vivos({ reguladores: regs, campo: [campo('A', { kind: 'reg', alarmas: { x: 'viva' } }), campo('B', { kind: 'reg', _ts: AHORA - 60000, alarmas: { y: 'vieja' } })] })
    expect(estadoEquipo(nodo('g', 'reg', { banco: 'B1' }), v).alarmas).toEqual(['viva'])
  })
})

describe('resumenEstado (bloque sitio)', () => {
  const r = (t: Estado[], n: Estado[] = []) => ({ tramos: new Map(t.map((e, i) => [`t${i}`, e])), nodos: new Map(n.map((e, i) => [`n${i}`, e])), puntos: new Map(), sentido: new Map() })
  it('energizado si hay alguno', () => expect(resumenEstado(r(['sinTension', 'energizado'], ['desconocido']))).toBe('energizado'))
  it('desconocido sin energizado', () => expect(resumenEstado(r(['sinTension', 'desconocido']))).toBe('desconocido'))
  it('sin tensión si todo está sin tensión', () => expect(resumenEstado(r(['sinTension'], ['sinTension']))).toBe('sinTension'))
  it('dibujo vacío: neutro', () => expect(resumenEstado(r([]))).toBeNull())
})

describe('listaAlarmas', () => {
  const v = vivos({
    campo: [
      campo('R1', { alarmas: { a: 'Sobrecorriente', b: 'Falla a tierra' } }),
      campo('R2', { online: false, alarmas: { a: 'Vieja' } }),
      campo('R3'),
    ],
  })
  const sitio = dib([nodo('s1', 'reco', { ref: 'R1' }), nodo('s2', 'reco', { ref: 'R2' })], [], { id: 'sit', nombre: 'Norte', tipo: 'sitio' })

  it('equipo con alarma y equipo sin comunicación (sin sus alarmas viejas)', () => {
    const d = dib([nodo('n1', 'reco', { ref: 'R1' }), nodo('n2', 'reco', { ref: 'R2', nombre: 'Reco 2' }), nodo('n3', 'reco', { ref: 'R3' }), nodo('n4', 'barra', { largo: 40 })], [])
    expect(listaAlarmas(d, [], v)).toEqual([
      { id: 'n1', nombre: 'R1', alarmas: ['Sobrecorriente', 'Falla a tierra'], sinCom: 0 },
      { id: 'n2', nombre: 'Reco 2', alarmas: [], sinCom: 1 },
    ])
  })

  it('un sitio suma lo de su dibujo y apunta a él', () => {
    const d = dib([nodo('b1', 'sitio', { dibujo: 'sit' })], [])
    expect(listaAlarmas(d, [sitio], v)).toEqual([
      { id: 'b1', nombre: 'Norte', alarmas: ['Sobrecorriente', 'Falla a tierra'], sinCom: 1, dibujo: 'sit' },
    ])
  })

  it('sin novedades → lista vacía', () => {
    expect(listaAlarmas(dib([nodo('n3', 'reco', { ref: 'R3' })], []), [], v)).toEqual([])
  })
})

describe('sentido del flujo', () => {
  const sentido = (d: Dibujo, v: Vivos) => Object.fromEntries(energizar(d, v).sentido)

  it('línea simple: de la fuente hacia la carga', () => {
    expect(sentido(lineaReco(), vivos({ campo: [campo('R1')] }))).toEqual({ t1: 1, t2: 1, t3: 1 })
  })
  it('cable dibujado al revés: sentido -1', () => {
    const d = lineaReco()
    d.conexiones[2] = con('t3', ['c', 'a'], ['b', 'p1'])
    expect(sentido(d, vivos({ campo: [campo('R1')] })).t3).toBe(-1)
  })
  it('reco abierto o sin datos: aguas abajo no se anima', () => {
    expect(sentido(lineaReco(), vivos({ campo: [campo('R1', { valores: { estado: false } })] }))).toEqual({ t1: 1 })
    expect(sentido(lineaReco(), vivos({ campo: [campo('R1', { online: false })] }))).toEqual({ t1: 1 })
  })
  it('anillo: el tramo donde se encuentran queda sin sentido', () => {
    const d = dib(
      [nodo('f', 'fuente'), nodo('s1', 'seccionador', { cerrado: true }), nodo('s2', 'seccionador', { cerrado: true })],
      [con('c1', ['f', 'a'], ['s1', 'a']), con('c2', ['s1', 'b'], ['s2', 'a']), con('c3', ['s2', 'b'], ['f', 'a'])],
    )
    expect(sentido(d, vivos())).toEqual({ c1: 1, c3: -1 })
  })
})

describe('kwSale', () => {
  const d = dib([nodo('m', 'medidor', { ref: 'M1' }), nodo('b', 'bomba', { ref: 'P1' }), nodo('x', 'barra', { largo: 40 })], [])
  const v = vivos({ meters: [{ name: 'M1', online: true, _ts: AHORA, power: 650000 }] })
  v.drives = new Map([['P1', { name: 'P1', online: true, _ts: AHORA, power: 180 } as never]])

  it('medidor aguas arriba: su potencia en kW, solo hacia afuera', () => {
    expect(kwSale(d, { source: 'm', target: 'x' }, 1, v)).toBe(650)
    expect(kwSale(d, { source: 'x', target: 'm' }, -1, v)).toBe(650)
    expect(kwSale(d, { source: 'x', target: 'm' }, 1, v)).toBeUndefined()
  })
  it('bomba aguas abajo: su potencia', () => {
    expect(kwSale(d, { source: 'x', target: 'b' }, 1, v)).toBe(180)
  })
  it('sin dato vivo o en cero: nada', () => {
    const viejo = vivos({ meters: [{ name: 'M1', online: true, _ts: AHORA - LIMITE - 1, power: 650000 }] })
    expect(kwSale(d, { source: 'm', target: 'x' }, 1, viejo)).toBeUndefined()
    const cero = vivos({ meters: [{ name: 'M1', online: true, _ts: AHORA, power: 0 }] })
    expect(kwSale(d, { source: 'm', target: 'x' }, 1, cero)).toBeUndefined()
  })
})

describe('TC, TP y conexiones de medición', () => {
  // fuente -> TC -> carga; TP colgado de la fuente; los dos secundarios al medidor (punto m)
  const d = dib(
    [nodo('f', 'fuente'), nodo('t', 'tc'), nodo('c', 'carga'), nodo('p', 'tp'), nodo('m', 'medidor', { ref: 'M1' }), nodo('c2', 'carga')],
    [
      con('l1', ['f', 'a'], ['t', 'a']), con('l2', ['t', 'b'], ['c', 'a']), con('l3', ['f', 'a'], ['p', 'a']),
      con('s1', ['t', 's'], ['m', 'm']), con('s2', ['p', 's'], ['m', 'm']), con('l4', ['m', 'b'], ['c2', 'a']),
    ],
  )
  const r = energizar(d, vivos())

  it('el TC en serie deja pasar la tensión', () => {
    expect(r.tramos.get('l2')).toBe('energizado')
    expect(r.sentido.get('l2')).toBe(1)
  })
  it('las conexiones de medición no tienen estado ni sentido y no energizan el medidor', () => {
    for (const k of ['s1', 's2']) { expect(r.tramos.has(k)).toBe(false); expect(r.sentido.has(k)).toBe(false) }
    expect(r.tramos.get('l4')).toBe('sinTension')
  })
  it('el TP no pasa tensión hacia su secundario', () => {
    expect(r.puntos.get('p:s')).toBe('sinTension')
  })
})

describe('enlaces de datos (comm ↔ equipo)', () => {
  const d = dib(
    [nodo('f', 'fuente'), nodo('m', 'medidor', { ref: 'M1' }), nodo('c', 'carga'), nodo('r', 'comm', { ref: 'Radio' })],
    [con('l1', ['f', 'a'], ['m', 'a']), con('l2', ['m', 'b'], ['c', 'a']), con('e1', ['r', 'd'], ['m', 'd'])],
  )
  const conRadio = (online: boolean, medidor: boolean) => {
    const v = vivos({ meters: medidor ? [{ name: 'M1', online: true, _ts: AHORA }] : [{ name: 'M1', online: false, _ts: AHORA }] })
    v.comms = new Map([['Radio', { name: 'Radio', online, _ts: AHORA } as never]])
    return v
  }

  it('ok: radio y medidor en línea', () => expect(estadoEnlace(d, d.conexiones[2], conRadio(true, true))).toBe('ok'))
  it('cortado: radio en línea y el medidor no responde', () => expect(estadoEnlace(d, d.conexiones[2], conRadio(true, false))).toBe('cortado'))
  it('desconocido: la radio está caída', () => expect(estadoEnlace(d, d.conexiones[2], conRadio(false, false))).toBe('desconocido'))
  it('el enlace no lleva tensión ni tiene estado de tramo', () => {
    const r = energizar(d, conRadio(true, true))
    expect(r.tramos.has('e1')).toBe(false)
    expect(r.tramos.get('l2')).toBe('energizado')
  })
  it('la barra de alarmas suma el enlace cortado', () => {
    const items = listaAlarmas(d, [], conRadio(true, false))
    expect(items.find(i => i.enlace)).toMatchObject({ id: 'm', nombre: 'Enlace cortado: Radio → M1', alarmas: ['Enlace cortado'], enlace: 'e1' })
  })
})

describe('puertos del sitio (entrada y salida del bloque)', () => {
  // general: fuente → bloque(a) ; bloque(b) → carga   ·   sitio: entrada → reco → salida
  const u = (conSalida = true, fuente = true): Unifilar => ({
    version: 1,
    dibujos: [
      dib(
        [...(fuente ? [nodo('f', 'fuente')] : []), nodo('bs', 'sitio', { dibujo: 's1' }), nodo('c', 'carga')],
        [...(fuente ? [con('l1', ['f', 'a'], ['bs', 'a'])] : []), con('l2', ['bs', 'b'], ['c', 'a'])],
      ),
      dib(
        [nodo('e', 'entrada'), nodo('r', 'reco', { ref: 'R1' }), ...(conSalida ? [nodo('o', 'salida')] : [])],
        [con('s1', ['e', 'a'], ['r', 'a']), ...(conSalida ? [con('s2', ['r', 'b'], ['o', 'a'])] : [])],
        { id: 's1', nombre: 'Norte', tipo: 'sitio' },
      ),
    ],
  })
  const tramo = (m: Map<string, ReturnType<typeof energizar>>, d: string, t: string) => m.get(d)!.tramos.get(t)

  it('la entrada toma la tensión de la línea que llega al bloque y la salida la devuelve a la general', () => {
    const m = energizarTodos(u(), vivos({ campo: [campo('R1')] }))
    expect(tramo(m, 's1', 's1')).toBe('energizado')
    expect(tramo(m, 'general', 'l2')).toBe('energizado')
  })
  it('reco abierto dentro del sitio: lo que cuelga del bloque queda sin tensión', () => {
    const m = energizarTodos(u(), vivos({ campo: [campo('R1', { valores: { estado: false } })] }))
    expect(tramo(m, 'general', 'l2')).toBe('sinTension')
  })
  it('sin símbolo de salida: lo que cuelga del bloque queda desconocido (nunca sin tensión)', () => {
    const m = energizarTodos(u(false), vivos({ campo: [campo('R1')] }))
    expect(tramo(m, 'general', 'l2')).toBe('desconocido')
  })
  it('sin nada que alimente el bloque: el sitio queda sin tensión adentro', () => {
    const m = energizarTodos(u(true, false), vivos({ campo: [campo('R1')] }))
    expect(tramo(m, 's1', 's1')).toBe('sinTension')
    expect(tramo(m, 'general', 'l2')).toBe('sinTension')
  })
})
