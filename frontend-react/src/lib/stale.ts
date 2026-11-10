// Si un equipo no actualiza en este tiempo, se considera "desactualizado":
// la tarjeta lo marca y apaga los gauges para no mostrar un valor viejo como vivo.
export const STALE_MS = 8000  // ~4 ciclos de poll (2s)

// `pollMs`: cada cuánto se actualiza ESE equipo (lo publica el poller). Un
// gateway RS-485 lento (p.ej. el ADAM, ~9 s por vuelta) no debe verse
// "desactualizado" en cada vuelta: el límite es 3 vueltas suyas, mínimo 8 s.
export function isStale(ts: number | undefined, now: number, pollMs?: number): boolean {
  const limit = Math.max(STALE_MS, 3 * (pollMs || 0))
  return ts == null || now - ts > limit
}

// Leyenda de un gráfico de tendencia: último valor numérico de `key`, o null si no
// hay o si es viejo (se muestra «—»). `ahora` null = rango fijo (pasado o ANALIZAR):
// ahí no se descarta nada por antigüedad.
// Límite: 2 pasos típicos entre puntos (mediana de los últimos), mínimo 2 min,
// porque los gráficos se releen cada ≤60 s y las ventanas de Influx agregan.
export const TENDENCIA_MIN_MS = 2 * 60_000
export function ultimoValor(data: Record<string, number | string>[], key: string, ahora: number | null): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i][key]
    if (typeof v !== 'number' || isNaN(v)) continue
    if (ahora == null) return v
    const pasos: number[] = []
    for (let j = Math.max(1, data.length - 20); j < data.length; j++) pasos.push(Number(data[j].ts) - Number(data[j - 1].ts))
    pasos.sort((a, b) => a - b)
    const paso = pasos.length ? pasos[pasos.length >> 1] : 0
    return ahora - Number(data[i].ts) > Math.max(TENDENCIA_MIN_MS, 2 * paso) ? null : v
  }
  return null
}
