// Gadget «Costo de energía»: rango de cada período y resumen de summary.costos filtrado por sitio. Puro.
export type Franja = { nombre: string; kwh: number; costo: number }
export type Costos = {
  moneda: string
  costoBombas: number | null
  sitios: { sitio: string; total: number | null; franjas: Franja[] }[]
  bombas: Record<string, { sitio: string; costo: number | null; porLitro: number | null; franjas: Franja[] }>
}
export type ResumenCosto = { costo: number | null; kwh: number | null; porLitro: number | null; franjas: Franja[] }

export const PERIODO_TXT: Record<string, string> = { hoy: 'HOY', ayer: 'AYER', '7d': '7 DÍAS', mes: 'MES EN CURSO', mes_anterior: 'MES ANTERIOR' }

// [desde, hasta) en días locales, como los períodos de Informes
export function rangoPeriodo(p: string, ahora = new Date()): [string, string] {
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0)
  const dia = (n: number) => { const r = new Date(hoy); r.setDate(r.getDate() + n); return r }
  const mes = (n: number) => new Date(hoy.getFullYear(), hoy.getMonth() + n, 1)
  const r: [Date, Date] = p === 'ayer' ? [dia(-1), hoy] : p === '7d' ? [dia(-6), dia(1)] : p === 'mes' ? [mes(0), dia(1)]
    : p === 'mes_anterior' ? [mes(-1), mes(0)] : [hoy, dia(1)]
  return [r[0].toISOString(), r[1].toISOString()]
}

const suma = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number')
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}
function juntar(listas: Franja[][]): Franja[] {
  const m = new Map<string, Franja>()
  for (const f of listas.flat()) {
    const x = m.get(f.nombre) ?? { nombre: f.nombre, kwh: 0, costo: 0 }
    x.kwh += f.kwh; x.costo += f.costo
    m.set(f.nombre, x)
  }
  return [...m.values()]
}

// Costo del sitio (energía + potencia) si hay tarifa de sitio; si no, el de sus bombas.
// $/L: costo de las bombas sobre su volumen (litros = costo / porLitro de cada bomba).
export function resumenCosto(c: Costos, volumenM3: number | null | undefined, sitios: string[] | null): ResumenCosto {
  const sit = sitios ? c.sitios.filter(x => sitios.includes(x.sitio)) : c.sitios
  const bom = Object.values(c.bombas).filter(b => !sitios || sitios.includes(b.sitio))
  const costoBom = sitios ? suma(bom.map(b => b.costo)) : c.costoBombas
  const conSitio = sit.some(x => x.total != null)
  const franjas = juntar((conSitio ? sit : bom).map(x => x.franjas))
  const litros = !sitios ? (volumenM3 ? volumenM3 * 1000 : null)
    : suma(bom.map(b => (b.costo && b.porLitro ? b.costo / b.porLitro : null)))
  return {
    costo: conSitio ? suma(sit.map(x => x.total)) : costoBom,
    kwh: franjas.length ? franjas.reduce((a, f) => a + f.kwh, 0) : null,
    porLitro: costoBom != null && litros ? costoBom / litros : null,
    franjas,
  }
}
