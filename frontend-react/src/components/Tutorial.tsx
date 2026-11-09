// Tutorial guiado del portal: resalta cada parte (elementos con data-tour="…") y la explica.
// Se lanza solo la primera vez que entra cada usuario (marca en localStorage) y con el botón «?».
import { useEffect, useLayoutEffect, useState } from 'react'
import { X } from 'lucide-react'

export type Paso = { tour?: string; titulo: string; texto: string }

export const PASOS: Paso[] = [
  { titulo: 'Bienvenido al portal', texto: 'Te mostramos en pocos pasos dónde está cada cosa. Podés salir cuando quieras y volver a verlo con el botón «?» de arriba a la derecha.' },
  { tour: 'nav-/', titulo: 'Dashboard', texto: 'Resumen de la planta en tiempo real: estado de cada bomba, mediciones principales y totales.' },
  { tour: 'nav-/unifilar', titulo: 'Unifilar', texto: 'Diagrama eléctrico con lo que está energizado. Tocá un equipo para ver sus mediciones y su tendencia; los seccionadores se pueden abrir y cerrar en la vista (solo visual, no maniobra el equipo real).' },
  { tour: 'nav-/equipos', titulo: 'Equipos', texto: 'Todos los equipos por tipo: bombas, medidores, reguladores, reconectadores y generadores. Tocá una tarjeta para entrar al detalle, con más datos y su línea de tiempo de estados.' },
  { tour: 'nav-/alarmas', titulo: 'Alarmas', texto: 'Alarmas activas y su historial: qué pasó, en qué equipo y cuándo.' },
  { tour: 'nav-/historicos', titulo: 'Tendencias', texto: 'Gráficos históricos. Elegí el rango arriba, arrastrá sobre un gráfico para hacer zoom y usá «+ Mis gráficos» para armar los tuyos, con las variables y colores que quieras.' },
  { tour: 'nav-/reportes', titulo: 'Reportes', texto: 'Informes en PDF y Excel (energía, arranques, demanda, etc.) y suscripciones para recibirlos por correo.' },
  { tour: 'nav-/comunicaciones', titulo: 'Comunicaciones', texto: 'Estado de los enlaces y de los equipos de red, para ver rápido si algo se quedó sin comunicación.' },
  { tour: 'nav-/config', titulo: 'Configuración', texto: 'Solo administradores: equipos, umbrales, usuarios, marca, unifilar y backups.' },
  { tour: 'estado', titulo: 'Estado de la planta', texto: 'P1: equipos en falla · P2: sin comunicación · P3: alarmas por umbral. Tocá cualquiera para ir a Alarmas.' },
  { tour: 'tema', titulo: 'Modo claro u oscuro', texto: 'Cambiá los colores de la pantalla según la luz del lugar.' },
  { tour: 'ayuda', titulo: 'Ayuda', texto: 'Con este botón volvés a ver este tutorial cuando quieras.' },
  { titulo: '¡Listo!', texto: 'Ya conocés el portal. Ante cualquier duda, tocá «?» arriba a la derecha.' },
]

const clave = (user: string) => `weg_tutorial_visto:${user || 'anon'}`
export const tutorialVisto = (user: string) => { try { return localStorage.getItem(clave(user)) === '1' } catch { return true } }
const marcarVisto = (user: string) => { try { localStorage.setItem(clave(user), '1') } catch { /* sin storage */ } }

const el = (p: Paso) => (p.tour ? document.querySelector<HTMLElement>(`[data-tour="${p.tour}"]`) : null)

export default function Tutorial({ user, onClose }: { user: string; onClose: () => void }) {
  // solo los pasos cuyo elemento está en pantalla (módulos sin licencia u opciones de admin no aparecen)
  // (se recalcula en cada render: alguna pestaña puede aparecer después de abierto el tutorial)
  const pasos = PASOS.filter(p => !p.tour || el(p))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const paso = pasos[Math.min(i, pasos.length - 1)]
  const cerrar = () => { marcarVisto(user); onClose() }

  useLayoutEffect(() => {
    const t = el(paso)
    t?.scrollIntoView({ block: 'nearest', inline: 'center' })
    const medir = () => setRect(t ? t.getBoundingClientRect() : null)
    medir()
    window.addEventListener('resize', medir); window.addEventListener('scroll', medir, true)
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true) }
  }, [paso])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
      else if (e.key === 'ArrowRight') setI(n => Math.min(n + 1, pasos.length - 1))
      else if (e.key === 'ArrowLeft') setI(n => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const ultimo = i === pasos.length - 1
  const pad = 6
  // globo debajo del elemento (o arriba si no entra); sin elemento, centrado
  const ancho = Math.min(340, window.innerWidth - 32)
  const estilo: React.CSSProperties = rect
    ? {
        left: Math.max(16, Math.min(rect.left + rect.width / 2 - ancho / 2, window.innerWidth - ancho - 16)),
        ...(rect.bottom + 200 < window.innerHeight ? { top: rect.bottom + pad + 10 } : { bottom: window.innerHeight - rect.top + pad + 10 }),
      }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tutorial-titulo">
      {rect
        ? <div className="fixed pointer-events-none border-2 transition-all duration-200" style={{
            left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            borderColor: 'hsl(var(--foreground))', boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
        : <div className="fixed inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />}
      <div className="fixed bg-card border shadow-lg p-4 flex flex-col gap-3" style={{ ...estilo, width: ancho }}>
        <div className="flex items-start gap-2">
          <h2 id="tutorial-titulo" className="text-sm font-bold tracking-wide flex-1">{paso.titulo}</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar tutorial" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{paso.texto}</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-muted-foreground flex-1">{i + 1} / {pasos.length}</span>
          {!ultimo && <button type="button" onClick={cerrar} className="text-xs text-muted-foreground hover:text-foreground px-2 min-h-[32px]">Saltar</button>}
          {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="text-xs border border-border bg-background px-3 min-h-[32px]">Anterior</button>}
          <button type="button" autoFocus onClick={() => (ultimo ? cerrar() : setI(i + 1))}
            className="text-xs font-semibold px-3 min-h-[32px] bg-foreground text-background">{ultimo ? 'Terminar' : 'Siguiente'}</button>
        </div>
      </div>
    </div>
  )
}
