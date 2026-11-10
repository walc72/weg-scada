import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiJson } from '@/lib/api'
import { PERIODO_TXT, rangoPeriodo, resumenCosto, type Costos, type ResumenCosto } from '@/lib/costo'
import type { GadgetProps } from './GadgetMarco'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const REFRESCO_MS = 5 * 60_000
type Op = { periodos: string[]; indicadores: string[]; sitios: string[] | null }
type Dato = { moneda: string; r: ResumenCosto } | 'sinTarifa' | 'error'

// Demo: escala por período para que se vean distintos
const DEMO = (p: string): { costos: Costos; volumenM3: number } => {
  const k = { hoy: 1, ayer: 1.1, '7d': 7, mes: 10, mes_anterior: 30 }[p] ?? 1
  const F = (nombre: string, kwh: number, precio: number) => ({ nombre, kwh: kwh * k, costo: kwh * k * precio })
  return {
    volumenM3: 4200 * k,
    costos: { moneda: 'Gs', costoBombas: 1_850_000 * k, sitios: [{ sitio: '', total: 2_100_000 * k, franjas: [F('Punta', 900, 520), F('Fuera de punta', 3100, 390)] }], bombas: {} },
  }
}

async function cargar(p: string, sitios: string[] | null): Promise<Dato> {
  if (MODE === 'mock') { const d = DEMO(p); return { moneda: d.costos.moneda, r: resumenCosto(d.costos, d.volumenM3, null) } }
  const [from, to] = rangoPeriodo(p)
  try {
    const s = await apiJson<{ costos?: Costos; totals?: { volumeM3?: number | null } }>('/reports/summary', { method: 'POST', body: JSON.stringify({ from, to }) })
    return s.costos ? { moneda: s.costos.moneda, r: resumenCosto(s.costos, s.totals?.volumeM3, sitios) } : 'sinTarifa'
  } catch { return 'error' }
}

const fmt = (v: number | null, dec = 0) => (v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: dec }))

function Valor({ etiqueta, valor, unidad }: { etiqueta: string; valor: string; unidad: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground tracking-wider truncate">{etiqueta}</div>
      <div className="font-mono text-lg font-medium tabular-nums leading-tight">{valor}{valor !== '—' && unidad && <span className="text-xs font-normal text-muted-foreground ml-1">{unidad}</span>}</div>
    </div>
  )
}

// Costo de la energía por período (de summary.costos, igual que el informe de Costos), filtrable por sitio
export default function Costo({ opciones }: GadgetProps<Op>) {
  const { periodos, indicadores, sitios } = opciones
  const [datos, setDatos] = useState<Record<string, Dato>>({})
  const clave = JSON.stringify([periodos, sitios])
  useEffect(() => {
    let vivo = true
    const leer = () => Promise.all(periodos.map(async p => [p, await cargar(p, sitios)] as const))
      .then(r => { if (vivo) setDatos(Object.fromEntries(r)) })
    leer()
    // ponytail: un summary por período cada 5 min y por visor; cachear en la API si pesa con muchos visores
    const t = setInterval(leer, REFRESCO_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  const vals = Object.values(datos)
  if (vals.length && vals.every(d => d === 'sinTarifa'))
    return <p className="text-sm text-muted-foreground">Sin tarifas cargadas. Se cargan en <Link className="underline" to="/config?tab=tarifas">Configuración → Tarifas</Link>.</p>
  const ver = (k: string) => indicadores.includes(k)

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {periodos.map(p => {
        const d = datos[p]
        return (
          <div key={p} className="min-w-0 border-l-2 border-border pl-3 flex flex-col gap-2">
            <div className="text-[11px] font-semibold tracking-widest">{PERIODO_TXT[p]}</div>
            {d === undefined ? <p className="text-sm text-muted-foreground">Calculando…</p>
              : d === 'error' ? <p className="text-sm text-muted-foreground">No se pudo calcular.</p>
              : d === 'sinTarifa' ? <p className="text-sm text-muted-foreground">Sin tarifa.</p>
              : <>
                {ver('costo') && <Valor etiqueta="COSTO" valor={fmt(d.r.costo)} unidad={d.moneda} />}
                {ver('kwh') && <Valor etiqueta="ENERGÍA" valor={fmt(d.r.kwh)} unidad="kWh" />}
                {ver('porLitro') && <Valor etiqueta={`${d.moneda}/L`} valor={fmt(d.r.porLitro, 4)} unidad="" />}
                {ver('franjas') && d.r.franjas.length > 0 && (
                  <table className="w-full text-xs">
                    <tbody>
                      {d.r.franjas.map(f => (
                        <tr key={f.nombre} className="border-t border-border">
                          <td className="py-1 pr-2 truncate">{f.nombre}</td>
                          <td className="py-1 text-right font-mono tabular-nums">{fmt(f.kwh)} kWh</td>
                          <td className="py-1 pl-2 text-right font-mono tabular-nums">{fmt(f.costo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>}
          </div>
        )
      })}
    </div>
  )
}
