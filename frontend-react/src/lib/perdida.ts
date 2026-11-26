// Series de Tendencias → Pérdida y Potencias a partir de las filas de /api/reports/series
// (pivoteadas por _time y medidor, power en W). Las usan la página y el selector de rango de cada gráfico.
type Fila = { _time: string; name: string; [k: string]: number | string }

// Pérdida (kW) = principal − Σ los que restan, en cada _time donde miden todos (un hueco no es 0 W)
export function perdidaDeFilas(filas: Fila[], main: string, restan: string[]): { ts: number; loss: number }[] {
  const sub = new Set(restan.filter(n => n && n !== main))
  const porT = new Map<string, { main?: number; sub: number; n: number }>()
  for (const r of filas) {
    if (r.name !== main && !sub.has(r.name)) continue
    const p = Number(r.power)
    if (!Number.isFinite(p)) continue
    let e = porT.get(r._time); if (!e) { e = { sub: 0, n: 0 }; porT.set(r._time, e) }
    if (r.name === main) e.main = p
    else { e.sub += p; e.n++ }
  }
  const out: { ts: number; loss: number }[] = []
  for (const [t, e] of porT) if (e.main !== undefined && e.n === sub.size) out.push({ ts: Date.parse(t), loss: (e.main - e.sub) / 1000 })
  return out.sort((a, b) => a.ts - b.ts)
}

// Energía acumulada (kWh, trapecios); un salto de más de 1 h (equipo caído) no se integra
export function energiaAcumulada(serie: { ts: number; loss: number }[]): { ts: number; energy: number }[] {
  let acc = 0
  return serie.map((p, i) => {
    if (i > 0) {
      const dtH = (p.ts - serie[i - 1].ts) / 3600000
      if (dtH > 0 && dtH <= 1) acc += ((p.loss + serie[i - 1].loss) / 2) * dtH
    }
    return { ts: p.ts, energy: +acc.toFixed(2) }
  })
}

// Potencia de cada medidor (kW) en una fila por _time: { ts, [medidor]: kW }
export function potenciasDeFilas(filas: Fila[]): Record<string, number>[] {
  const porT = new Map<number, Record<string, number>>()
  for (const r of filas) {
    const p = Number(r.power)
    if (!Number.isFinite(p)) continue
    const ts = Date.parse(r._time)
    let row = porT.get(ts); if (!row) { row = { ts }; porT.set(ts, row) }
    row[r.name] = p / 1000
  }
  return [...porT.values()].sort((a, b) => a.ts - b.ts)
}
