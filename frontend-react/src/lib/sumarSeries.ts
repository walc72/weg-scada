// Total por instante de varias series cuyos puntos llegan en momentos distintos (p. ej. drives por MQTT).
// Casilleros comunes de `paso` ms y cada serie retiene su último valor, así cada casillero suma todas
// las que ya reportaron (sin el serrucho de sumar solo las que cayeron en el mismo instante).
// Nunca un valor viejo: una serie cuyo último punto tiene más de `vence` ms deja de sumar.
export type P = { ts: number; v: number }

export function sumarRetenido(series: Record<string, P[]>, vence: number, paso = 2000): P[] {
  const porCasillero = new Map<number, Map<string, number>>()
  for (const [n, pts] of Object.entries(series)) {
    for (const p of pts) {
      const ts = Math.round(p.ts / paso) * paso
      let c = porCasillero.get(ts); if (!c) { c = new Map(); porCasillero.set(ts, c) }
      c.set(n, p.v)
    }
  }
  const ultimo = new Map<string, P>()   // último punto de cada serie (en su casillero)
  return [...porCasillero.keys()].sort((a, b) => a - b).map(ts => {
    for (const [n, v] of porCasillero.get(ts)!) ultimo.set(n, { ts, v })
    let v = 0; for (const p of ultimo.values()) if (ts - p.ts <= vence) v += p.v
    return { ts, v }
  })
}
