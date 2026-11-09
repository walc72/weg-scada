// Tendencia de un equipo del unifilar a partir de /api/reports/series. Función pura.
import type { AppConfig } from '../types'
import type { Nodo } from './unifilar'
import { fasesDeBanco } from './energizar'
import slug from './slug'
import { aLps, UNIDAD_CAUDAL } from './flow'
import { colorDeSerie, colorFase, faseDeIndice } from './paleta'
import type { Magnitud } from './paleta'

export type FilaSerie = { _time: string; name: string; [k: string]: number | string }
export interface Series { drives?: FilaSerie[]; meters?: FilaSerie[]; flows?: FilaSerie[]; campo?: FilaSerie[] }
export type Punto = { ts: number } & Record<string, number>
export interface Grafico {
  titulo: string
  unidad: string
  escalon?: boolean
  dec?: number        // decimales del valor
  alterna?: boolean   // se ve de a uno, eligiéndolo (variables de medidor y bomba)
  lineas: { key: string; color: string }[]
  datos: Punto[]
}

// Une por _time los valores de `campo` de cada nombre (una línea por nombre)
function unir(filas: FilaSerie[] | undefined, nombres: string[], campo: string, k = 1): Punto[] {
  const m = new Map<number, Punto>()
  for (const f of filas ?? []) {
    const v = Number(f[campo])
    if (!nombres.includes(f.name) || f[campo] == null || !Number.isFinite(v)) continue
    const ts = Date.parse(f._time)
    if (!m.has(ts)) m.set(ts, { ts } as Punto)
    m.get(ts)![f.name] = v * k
  }
  return [...m.values()].sort((a, b) => a.ts - b.ts)
}

export function serieDe(n: Nodo, s: Series, cfg: AppConfig): Grafico[] {
  const ref = n.ref ?? ''
  // varias líneas = fases de un banco; una sola = color de su magnitud (o de serie)
  const lineas = (nombres: string[], magnitud?: Magnitud) => nombres.map((key, i) =>
    ({ key, color: nombres.length > 1 ? colorFase(faseDeIndice(i)) : colorDeSerie({ magnitud, indice: 0 }) }))
  const uno = (titulo: string, unidad: string, filas: FilaSerie[] | undefined, campo: string, magnitud: Magnitud, k = 1): Grafico[] =>
    [{ titulo, unidad, lineas: lineas([ref], magnitud), datos: unir(filas, [ref], campo, k) }]
  // varias variables del mismo equipo: el panel muestra una por vez (la primera siempre, las demás si hay datos)
  const varias = (filas: FilaSerie[] | undefined, vs: [string, string, string, number, number, Magnitud?][]): Grafico[] =>
    vs.map(([titulo, unidad, campo, k, dec, magnitud]) => ({ titulo, unidad, dec, alterna: true, lineas: lineas([ref], magnitud), datos: unir(filas, [ref], campo, k) }))
      .filter((g, i) => i === 0 || g.datos.length > 0)
  switch (n.tipo) {
    case 'bomba': return varias(s.drives, [
      ['Corriente', 'A', 'current', 1, 1, 'corriente'], ['Velocidad', 'rpm', 'motor_speed', 1, 0], ['Potencia', 'kW', 'power', 1, 1, 'potencia'],
      ['Frecuencia', 'Hz', 'frequency', 1, 1], ['Tensión', 'V', 'voltage', 1, 0, 'tension'], ['Caudal', UNIDAD_CAUDAL, 'flow', aLps(1), 1, 'caudal'],
    ])
    case 'medidor': return varias(s.meters, [
      ['Potencia', 'kW', 'power', 1 / 1000, 0, 'potencia'], ['Corriente', 'A', 'current', 1, 1, 'corriente'], ['Tensión', 'kV', 'voltage', 1 / 1000, 2, 'tension'], ['Factor de potencia', '', 'pf', 1, 3, 'fp'],
    ])
    // combustible y batería: mediciones libres del mapa (x_<slug>)
    case 'gen': return varias(s.campo, [
      ['Potencia', 'kW', 'kw', 1, 0, 'potencia'], ['Frecuencia', 'Hz', 'hz', 1, 1], ['Tensión L-L', 'V', 'vl1l2', 1, 0, 'tension'], ['Velocidad', 'rpm', 'rpm', 1, 0],
      ['Combustible', '%', 'x_' + slug('Nivel de combustible'), 1, 0], ['Batería', 'V', 'x_' + slug('Tensión de batería'), 1, 1],
    ])
    case 'caudalimetro': return uno('Caudal', UNIDAD_CAUDAL, s.flows, 'flow', 'caudal', aLps(1))
    case 'reco': {
      const conIa = (s.campo ?? []).some(f => f.name === ref && f.ia != null)
      return uno('Corriente', 'A', s.campo, conIa ? 'ia' : 'i', 'corriente')
    }
    case 'reg': {
      const nombres = n.banco != null ? fasesDeBanco(cfg, n.banco).map(r => r.name) : [ref]
      return [
        { titulo: 'Tensión de carga', unidad: 'V', alterna: true, lineas: lineas(nombres, 'tension'), datos: unir(s.campo, nombres, 'v') },
        { titulo: 'Tap', unidad: '', escalon: true, alterna: true, lineas: lineas(nombres), datos: unir(s.campo, nombres, 'tap') },
      ]
    }
    default: return []
  }
}
