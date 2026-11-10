// Mis gráficos: variables por tipo de equipo y armado de filas desde /api/reports/series.
import type { CampoRow } from '../views/RecosTab'

export type Src = 'drive' | 'meter' | 'reco' | 'reg' | 'gen'
export type Traza = { src: Src; name: string; field: string; color: string }
export type Grafico = { id: string; titulo: string; trazas: Traza[] }
export type Fila = { _time: string; name: string; [k: string]: number | string | undefined }
export type Datos = { drives?: Fila[]; meters?: Fila[]; campo?: CampoRow[] }

// variables por tipo de equipo: campo en InfluxDB, campo del buffer en memoria, unidad y escala
type Var = { field: string; label: string; unit: string; scale?: number; buf?: string }
export const VARIABLES: Record<Src, Var[]> = {
  drive: [
    { field: 'current', label: 'Corriente', unit: 'A' },
    { field: 'power', label: 'Potencia', unit: 'kW' },
    { field: 'voltage', label: 'Tensión de salida', unit: 'V' },
    { field: 'motor_speed', label: 'Velocidad', unit: 'RPM', buf: 'speed' },
    { field: 'frequency', label: 'Frecuencia', unit: 'Hz' },
    { field: 'igbt_temp', label: 'Temp. IGBT', unit: '°C', buf: 'igbtTemp' },
    { field: 'scr_temp', label: 'Temp. SCR', unit: '°C', buf: 'scrTemp' },
  ],
  meter: [
    { field: 'voltage', label: 'Tensión L-L', unit: 'kV', scale: 1 / 1000 },
    { field: 'current', label: 'Corriente', unit: 'A' },
    { field: 'power', label: 'Potencia', unit: 'kW', scale: 1 / 1000 },
    { field: 'pf', label: 'Factor de potencia', unit: '' },
  ],
  reco: [
    { field: 'ia', label: 'Corriente fase A', unit: 'A' },
    { field: 'ib', label: 'Corriente fase B', unit: 'A' },
    { field: 'ic', label: 'Corriente fase C', unit: 'A' },
  ],
  reg: [
    { field: 'tap', label: 'Posición de tap', unit: '' },
    { field: 'v', label: 'Tensión de carga', unit: 'V' },
    { field: 'vConsigna', label: 'Consigna', unit: 'V' },
  ],
  // generador (DSE): x_<slug> son mediciones libres del mapa por defecto
  gen: [
    { field: 'kw', label: 'Potencia activa', unit: 'kW' },
    { field: 'vl1l2', label: 'Tensión L1-L2', unit: 'V' },
    { field: 'il1', label: 'Corriente L1', unit: 'A' },
    { field: 'hz', label: 'Frecuencia', unit: 'Hz' },
    { field: 'rpm', label: 'Velocidad', unit: 'RPM' },
    { field: 'x_temperatura_refrigerante', label: 'Temp. refrigerante', unit: '°C' },
    { field: 'x_nivel_de_combustible', label: 'Combustible', unit: '%' },
    { field: 'x_tension_de_bateria', label: 'Tensión de batería', unit: 'V' },
  ],
}
export const TIPO: Record<Src, string> = { drive: 'Bomba', meter: 'Medidor', reco: 'Reconectador', reg: 'Regulador', gen: 'Generador' }
export const varDe = (t: Pick<Traza, 'src' | 'field'>) => VARIABLES[t.src].find(v => v.field === t.field)

// Datos de InfluxDB → filas { ts, t0, t1, … } (una columna por traza, alineadas por _time)
export function armar(d: Datos, trazas: Traza[]): Record<string, number>[] {
  const porTs = new Map<number, Record<string, number>>()
  trazas.forEach((t, i) => {
    const filas = t.src === 'drive' ? d.drives : t.src === 'meter' ? d.meters : (d.campo || []).filter(r => r.kind === t.src)
    const esc = varDe(t)?.scale ?? 1
    for (const r of filas || []) {
      if (r.name !== t.name || typeof r[t.field] !== 'number' || isNaN(r[t.field] as number)) continue
      const ts = new Date(r._time).getTime()
      let o = porTs.get(ts); if (!o) { o = { ts }; porTs.set(ts, o) }
      o[`t${i}`] = (r[t.field] as number) * esc
    }
  })
  return [...porTs.values()].sort((a, b) => a.ts - b.ts)
}

