// Tendencia de un equipo del unifilar a partir de /api/reports/series. Función pura.
import type { AppConfig } from '../types'
import type { Nodo } from './unifilar'
import { fasesDeBanco } from './energizar'
import { FASOR_COLORES } from '../components/Fasorial'

export type FilaSerie = { _time: string; name: string; [k: string]: number | string }
export interface Series { drives?: FilaSerie[]; meters?: FilaSerie[]; flows?: FilaSerie[]; campo?: FilaSerie[] }
export type Punto = { ts: number } & Record<string, number>
export interface Grafico {
  titulo: string
  unidad: string
  escalon?: boolean
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
  const lineas = (nombres: string[]) => nombres.map((key, i) => ({ key, color: FASOR_COLORES[i % FASOR_COLORES.length] }))
  const uno = (titulo: string, unidad: string, filas: FilaSerie[] | undefined, campo: string, k = 1): Grafico[] =>
    [{ titulo, unidad, lineas: lineas([ref]), datos: unir(filas, [ref], campo, k) }]
  switch (n.tipo) {
    case 'bomba': return uno('Corriente', 'A', s.drives, 'current')
    case 'medidor': return uno('Potencia', 'kW', s.meters, 'power', 1 / 1000)
    case 'caudalimetro': return uno('Caudal', 'm³/h', s.flows, 'flow')
    case 'reco': {
      const conIa = (s.campo ?? []).some(f => f.name === ref && f.ia != null)
      return uno('Corriente', 'A', s.campo, conIa ? 'ia' : 'i')
    }
    case 'reg': {
      const nombres = n.banco != null ? fasesDeBanco(cfg, n.banco).map(r => r.name) : [ref]
      return [
        { titulo: 'Tap', unidad: '', escalon: true, lineas: lineas(nombres), datos: unir(s.campo, nombres, 'tap') },
        { titulo: 'Tensión de carga', unidad: 'V', lineas: lineas(nombres), datos: unir(s.campo, nombres, 'v') },
      ]
    }
    default: return []
  }
}
