// Total por instante de varias series cuyos puntos llegan en momentos distintos (p. ej. drives por MQTT).
// Casilleros comunes de `paso` ms y cada serie retiene su último valor, así cada casillero suma todas
// las que ya reportaron (sin el serrucho de sumar solo las que cayeron en el mismo instante).
// ponytail: retiene sin vencimiento; alcanza para el buffer corto y las ventanas alineadas de InfluxDB.
export type P = { ts: number; v: number }

export function sumarRetenido(series: Record<string, P[]>, paso = 2000): P[] {
  const porCasillero = new Map<number, Map<string, number>>()
  for (const [n, pts] of Object.entries(series)) {
    for (const p of pts) {
      const ts = Math.round(p.ts / paso) * paso
      let c = porCasillero.get(ts); if (!c) { c = new Map(); porCasillero.set(ts, c) }
      c.set(n, p.v)
    }
  }
  const ultimo = new Map<string, number>()
  return [...porCasillero.keys()].sort((a, b) => a - b).map(ts => {
    for (const [n, v] of porCasillero.get(ts)!) ultimo.set(n, v)
    let v = 0; for (const x of ultimo.values()) v += x
    return { ts, v }
  })
}
