/**
 * Merge de series temporales de distintos drives/medidores.
 *
 * Cada punto de historial se estampa con Date.now() al llegar su mensaje MQTT,
 * asi que los puntos de un mismo ciclo de poll difieren en milisegundos entre
 * drives. Un join por igualdad exacta de timestamp casi nunca matchea (una fila
 * por muestra con el resto de columnas vacias); y alinear por indice corre las
 * series en el tiempo cuando un buffer es mas corto.
 *
 * Aca se agrupa por cercania: puntos a menos de `toleranceMs` del inicio del
 * cluster caen en la misma fila. Con pollIntervalMs=2000 en el poller, 900 ms
 * agrupa un ciclo completo sin mezclar ciclos vecinos.
 */

export interface TimedPoint {
  ts: number
}

export interface MergedRow<T extends TimedPoint> {
  ts: number
  points: Record<string, T>
}

export const DEFAULT_TOLERANCE_MS = 900

export function mergeByTimestamp<T extends TimedPoint>(
  series: Record<string, T[]>,
  toleranceMs = DEFAULT_TOLERANCE_MS
): MergedRow<T>[] {
  const all: Array<{ key: string; p: T }> = []
  for (const [key, arr] of Object.entries(series)) {
    for (const p of arr) all.push({ key, p })
  }
  all.sort((a, b) => a.p.ts - b.p.ts)

  const rows: MergedRow<T>[] = []
  let current: MergedRow<T> | null = null
  for (const { key, p } of all) {
    if (!current || p.ts - current.ts > toleranceMs) {
      current = { ts: p.ts, points: {} }
      rows.push(current)
    }
    // Ultimo punto de la serie dentro del cluster gana
    current.points[key] = p
  }
  return rows
}
