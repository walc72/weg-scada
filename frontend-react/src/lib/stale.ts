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
