import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authFetch } from '../store/auth'

const DATA_MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

interface Evento { device: string; type: string; text: string; start: number; end: number | null }
const TIPO: Record<string, string> = {
  FALLA: 'FALLA', ALARMA_EQUIPO: 'ALARMA', CORRIENTE_ALTA: 'CORRIENTE ALTA', TEMP_ALTA: 'TEMPERATURA ALTA',
  ERRORES_COMM: 'ERRORES DE COMUNICACIÓN', SIN_COMUNICACION: 'SIN COMUNICACIÓN', DISPARO: 'DISPARO', BLOQUEO: 'BLOQUEO',
}
const P1 = new Set(['FALLA', 'DISPARO'])
const fmtFecha = (t: number) => new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fmtDur = (ms: number) => { const s = Math.round(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

// Eventos de un equipo (inicio/fin de cada alarma) de los últimos 7 días, de /api/alarms
export default function EventosEquipo({ device }: { device: string }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  useEffect(() => {
    if (DATA_MODE !== 'live') { setEventos([]); return }
    const q = new URLSearchParams({ from: String(Date.now() - 7 * 86400_000), to: String(Date.now()), device })
    authFetch(`/api/alarms?${q}`).then(r => r.ok ? r.json() : Promise.reject())
      .then((j: { alarms?: Evento[] }) => setEventos((j.alarms || []).sort((a, b) => b.start - a.start)))
      .catch(() => setEventos([]))
  }, [device])

  return (
    <section aria-labelledby="t-ev" className="bg-card border">
      <header className="flex items-center gap-2 px-3 py-2 border-b">
        <h2 id="t-ev" className="text-xs font-bold tracking-widest">EVENTOS DEL EQUIPO · 7 DÍAS</h2>
        <Link to="/alarmas" className="ml-auto text-xs text-primary hover:underline">Ver todas las alarmas</Link>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] tracking-wider text-muted-foreground text-left">
              <th scope="col" className="font-medium px-3 py-2 border-b">INICIO</th>
              <th scope="col" className="font-medium px-3 py-2 border-b">TIPO</th>
              <th scope="col" className="font-medium px-3 py-2 border-b">EVENTO</th>
              <th scope="col" className="font-medium px-3 py-2 border-b">DURACIÓN</th>
            </tr>
          </thead>
          <tbody>
            {eventos === null ? (
              <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground">Cargando…</td></tr>
            ) : eventos.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground">Sin eventos en los últimos 7 días.</td></tr>
            ) : eventos.map(ev => {
              const activo = ev.end == null
              return (
                <tr key={`${ev.type}|${ev.start}`} className="border-b border-border/60">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{fmtFecha(ev.start)}</td>
                  <td className="px-3 py-1.5">
                    <span className="text-[11px] font-bold tracking-wider px-1.5 py-0.5 border whitespace-nowrap"
                      style={P1.has(ev.type) ? { background: 'var(--p1)', color: '#16191C', borderColor: 'var(--p1)' } : ev.type === 'SIN_COMUNICACION' ? { borderColor: 'var(--st-com)', color: 'var(--st-com)' } : undefined}>
                      {TIPO[ev.type] || (ev.type.startsWith('ALARMA_') ? 'ALARMA' : ev.type)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">{ev.text}</td>
                  <td className="px-3 py-1.5 font-mono whitespace-nowrap">{activo ? <span style={{ color: 'var(--p1-text)' }}>ACTIVA</span> : fmtDur((ev.end as number) - ev.start)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
