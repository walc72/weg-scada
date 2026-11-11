import { fmt, puntosLibres } from '../components/CampoBase'
import type { Tono } from '../components/CampoBase'
import { equipoDe, estadoGenVivo, fresco } from '../components/unifilar/Mediciones'
import { modoDe, modoTexto } from './generador'
import { aLpsN, UNIDAD_CAUDAL, volumenCorto } from './flow'
import { faseDeIndice } from './paleta'
import type { Fase } from './paleta'
import { recoCerrado } from './reco'
import type { Vivos } from './energizar'
import type { Nodo } from './unifilar'
import { nombreVisible } from './unifilar'
import type { CampoConfig, CampoState } from '../types'

export interface ValorClave { etiqueta: string; valor: string; unidad: string }   // valor '—' sin dato fresco
export interface FilaBanco { nombre: string; fase: Fase; v: string; tap: string; fp: string }
export interface ResumenEquipo {
  existe: boolean; titulo: string; subtitulo: string
  estado: { tono: Tono; texto: string }
  alarmas: { texto: string; prioridad: 'p1' | 'p3' }[]
  valores: ValorClave[]; banco?: FilaBanco[]
  detalle: string | null            // ruta de la página de detalle; null = sin botón
}

const N = (x: unknown) => (typeof x === 'number' ? x : null)
const val = (etiqueta: string, x: unknown, dec: number, unidad = ''): ValorClave => ({ etiqueta, valor: fmt(N(x), dec), unidad })
const tap = (x: unknown) => (typeof x === 'number' && x > 0 ? `+${fmt(x, 0)}` : fmt(N(x), 0))
// Alarmas de un equipo de campo (solo con dato fresco); nivel 2 = advertencia (p3)
const alarmasDe = (st: CampoState | undefined, v: Vivos, prefijo = ''): ResumenEquipo['alarmas'] =>
  fresco(st, v) && !st!.fueraServicio ? Object.entries(st!.alarmas).map(([k, t]) => ({ texto: prefijo + t, prioridad: st!.niveles?.[k] === 2 ? 'p3' : 'p1' })) : []
// Chip según la prioridad más alta presente (p1 → ALARMA, solo p3 → ADVERTENCIA)
const chipAlarma = (al: ResumenEquipo['alarmas']) =>
  al.some(a => a.prioridad === 'p1') ? { tono: 'p1' as Tono, texto: 'ALARMA' } : { tono: 'p3' as Tono, texto: 'ADVERTENCIA' }
const FUERA = { tono: 'off' as Tono, texto: 'FUERA DE SERVICIO' }

export function resumenEquipo(n: Nodo, v: Vivos, opts: { generadores: boolean }): ResumenEquipo {
  const eq = equipoDe(n, v)
  const titulo = nombreVisible(n, v.config)
  const base = { existe: true, titulo, subtitulo: '', estado: { tono: 'info' as Tono, texto: 'EN LÍNEA' }, alarmas: [], valores: [] as ValorClave[], detalle: null as string | null }
  if (!eq.existe) return { ...base, existe: false, estado: { tono: 'p3', texto: 'NO ENCONTRADO' } }
  const nom = encodeURIComponent(eq.nombre)
  const enLinea = (ok: boolean, fs = false) => fs ? FUERA : ok ? { tono: 'info' as Tono, texto: 'EN LÍNEA' } : { tono: 'com' as Tono, texto: 'SIN COMUNICACIÓN' }

  if (n.tipo === 'bomba') {
    const d = eq.drive, ok = !!d && !d.fueraServicio && fresco(d, v)
    const x = ok ? d! : undefined
    const estado = d?.fueraServicio ? FUERA : !x ? { tono: 'com' as Tono, texto: 'SIN COMUNICACIÓN' }
      : x.fault ? { tono: 'p1' as Tono, texto: 'FALLA' }
      : x.running ? { tono: 'run' as Tono, texto: 'EN MARCHA' } : { tono: 'off' as Tono, texto: 'PARADA' }
    const alarmas: ResumenEquipo['alarmas'] = []
    if (x?.fault) alarmas.push({ texto: x.faultText || x.statusText, prioridad: 'p1' })
    if (x?.alarmTempHigh) alarmas.push({ texto: 'Temperatura alta', prioridad: 'p3' })
    return {
      ...base, subtitulo: d?.type ?? '', estado, alarmas, detalle: `/motor/${nom}`,
      valores: [
        val('Corriente', x?.current, 1, 'A'), val('Frecuencia', x?.frequency, 1, 'Hz'), val('Potencia', x?.power, 1, 'kW'),
        val('Temperatura', x && (x.type === 'SSW900' ? x.scrTemp : x.igbtTemp), 0, '°C'), val('Horas de marcha', x?.runHours, 0, 'h'),
      ],
    }
  }

  if (n.tipo === 'medidor') {
    const m = eq.meter, x = m && fresco(m, v) ? m : undefined
    return {
      ...base, subtitulo: m?.type ?? '', estado: enLinea(!!x), detalle: `/medidor/${nom}`,
      valores: [val('Tensión', x?.voltage, 0, 'V'), val('Corriente', x?.current, 1, 'A'),
        val('Potencia', x && x.power / 1000, 0, 'kW'), val('FP', x?.pf, 2)],
    }
  }

  if (n.tipo === 'caudalimetro') {
    const f = v.flowmeters.get(eq.nombre), x = f && fresco(f, v) ? f : undefined
    return { ...base, subtitulo: 'Caudalímetro', estado: enLinea(!!x), valores: [val('Caudal', aLpsN(x?.flow), 1, UNIDAD_CAUDAL), (() => { const v = volumenCorto(x?.total); return val('Totalizador', v?.valor, v?.dec ?? 0, v?.unidad ?? 'L') })()] }
  }

  // Banco de reguladores: una fila por fase
  if (n.banco != null) {
    const filas = eq.campos.map(({ cfg, st }, i): FilaBanco & { vivo: boolean; fs: boolean } => {
      const fs = !!st?.fueraServicio, vivo = !fs && fresco(st, v), s = st?.valores
      return { nombre: cfg.name, fase: faseDeIndice(i), vivo, fs, v: vivo ? fmt(N(s!.v), 0) : '—', tap: vivo ? tap(s!.tap) : '—', fp: vivo ? fmt(N(s!.fp), 2) : '—' }
    })
    const alarmas = eq.campos.flatMap(({ cfg, st }) => alarmasDe(st, v, `${cfg.name}: `))
    const fuera = filas.filter(f => f.fs).length, sin = filas.filter(f => !f.vivo && !f.fs).length
    const estado = alarmas.length ? chipAlarma(alarmas)
      : fuera === filas.length ? FUERA
      : sin === filas.length - fuera ? { tono: 'com' as Tono, texto: 'SIN COMUNICACIÓN' }
      : sin ? { tono: 'com' as Tono, texto: 'PARCIAL' } : { tono: 'info' as Tono, texto: 'EN LÍNEA' }
    return { ...base, subtitulo: 'Banco de reguladores', estado, alarmas, banco: filas.map(({ vivo: _v, fs: _f, ...f }) => f), detalle: `/campo/${encodeURIComponent(filas[0].nombre)}` }
  }

  // Equipos de campo de un solo punto: reco, reg, gen y desconocidos
  const { cfg, st } = eq.campos[0] ?? ({} as { cfg?: CampoConfig; st?: CampoState })
  if (!cfg) return base
  const fs = !!st?.fueraServicio, ok = !fs && fresco(st, v), s = st?.valores ?? {}
  const alarmas = alarmasDe(st, v)
  const comun = { ...base, subtitulo: cfg.modelo ?? '', alarmas, detalle: `/campo/${encodeURIComponent(cfg.name)}` }

  if (n.tipo === 'reg') {
    return {
      ...comun, estado: alarmas.length ? chipAlarma(alarmas) : enLinea(ok, fs),
      valores: [val('Tensión de carga', ok ? s.v : null, 0, 'V'), { etiqueta: 'Tap', valor: ok ? tap(s.tap) : '—', unidad: '' },
        val('Corriente', ok ? s.i : null, 0, 'A'), val('FP', ok ? s.fp : null, 2)],
    }
  }
  if (n.tipo === 'reco') {
    const c = recoCerrado(st ?? { alarmas: {}, valores: {} })
    const estado = !ok ? enLinea(false, fs)
      : c === 'cerrado' ? { tono: 'run' as Tono, texto: 'CERRADO' } : c === 'abierto' ? { tono: 'off' as Tono, texto: 'ABIERTO' }
      : c === 'disparo' ? { tono: 'p1' as Tono, texto: 'DISPARO' } : enLinea(true)
    const g = (k: string) => (ok ? s[k] : null)
    return { ...comun, estado, valores: s.ia == null && ok
      ? [val('Corriente', s.i, 0, 'A')]
      : [val('Corriente A', g('ia'), 0, 'A'), val('Corriente B', g('ib'), 0, 'A'), val('Corriente C', g('ic'), 0, 'A')] }
  }
  if (n.tipo === 'gen') {
    const e = estadoGenVivo(st, v)
    const valores = [{ etiqueta: 'Modo', valor: ok ? modoTexto(st!.modelo, modoDe(st)) : '—', unidad: '' },
      val('Tensión L-L', ok ? s.vl1l2 : null, 0, 'V'), val('Potencia', ok ? s.kw : null, 0, 'kW')]
    if (puntosLibres(cfg).meds.some(p => p.nombre === 'Nivel de combustible')) valores.push(val('Combustible', ok ? st!.extras?.['Nivel de combustible'] : null, 0, '%'))
    return { ...comun, estado: { tono: e.tono, texto: e.texto }, valores,
      detalle: opts.generadores ? `/generadores/${encodeURIComponent(cfg.name)}` : comun.detalle }
  }
  // Tipo sin valores fijos: los primeros 4 puntos libres medidos
  const valores = puntosLibres(cfg).meds.slice(0, 4).map(p => val(p.nombre!, ok ? st!.extras?.[p.nombre!] : null, p.decimales ?? 0, p.unidad ?? ''))
  return { ...comun, estado: alarmas.length ? chipAlarma(alarmas) : enLinea(ok, fs), valores }
}
