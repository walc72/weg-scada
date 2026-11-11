// Series de InfluxDB de las últimas `ventanaH` horas (POST /api/reports/series), refresco cada 60 s.
// `datos` null: modo no live o todavía cargando. `fallo`: la última consulta falló (Influx caído o sin respuesta).
import { useEffect, useState } from 'react'
import { authFetch } from '../store/auth'
import type { Datos, Fila } from './misGraficos'

export const EN_VIVO = ((import.meta.env.VITE_DATA_MODE as string) || 'mock') === 'live'
export type DatosVentana = Datos & { flows?: Fila[] }
// Resolución pedida a InfluxDB (s): misma que Históricos, ~400 puntos por ventana
export const windowSecDe = (ventanaH: number) => Math.min(3600, Math.max(10, Math.round(ventanaH * 3600 / 400)))

// «Sin InfluxDB» = modo no live, o Influx falló y no hay nada suyo para mostrar → buffer en memoria.
// Mientras una consulta normal está pendiente no se usa el buffer (no se mezclan fuentes).
export const usarBuffer = (enVivo: boolean, fallo: boolean, hayInflux: boolean) => !enVivo || (fallo && !hayInflux)

// Un pedido compartido por ventana: los gadgets que piden la misma ventana a la vez (montan juntos y
// refrescan cada 60 s) reciben la misma respuesta en vez de bajarla cada uno por un enlace lento
const compartido = new Map<number, { t: number; p: Promise<DatosVentana> }>()
function pedirVentana(ventanaH: number): Promise<DatosVentana> {
  const e = compartido.get(ventanaH)
  if (e && Date.now() - e.t < 15_000) return e.p
  const to = Date.now(), from = to - ventanaH * 3600_000
  const p = authFetch('/api/reports/series', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), windowSec: windowSecDe(ventanaH), bucket: 'weg_drives' }),
  }).then(r => (r.ok ? r.json() as Promise<DatosVentana> : Promise.reject(new Error(`HTTP ${r.status}`))))
  compartido.set(ventanaH, { t: Date.now(), p })
  p.catch(() => compartido.delete(ventanaH))
  return p
}

export function useSeriesVentana(ventanaH: 1 | 6 | 24): { datos: DatosVentana | null; fallo: boolean } {
  const [datos, setDatos] = useState<DatosVentana | null>(null)
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    if (!EN_VIVO) return
    setDatos(null); setFallo(false)   // otra ventana: no mostrar la anterior bajo el título nuevo
    let vivo = true
    const cargar = () => {
      if (document.hidden) return   // pestaña oculta: no se pide nada; al volver se refresca
      pedirVentana(ventanaH)
        .then(d => { if (vivo) { setDatos(d); setFallo(false) } })
        .catch(() => { if (vivo) setFallo(true) })   // se reintenta en el próximo ciclo; queda lo último que llegó
    }
    const alVolver = () => { if (!document.hidden) cargar() }
    cargar()
    const id = setInterval(cargar, 60_000)
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo = false; clearInterval(id); document.removeEventListener('visibilitychange', alVolver) }
  }, [ventanaH])
  return { datos, fallo }
}
