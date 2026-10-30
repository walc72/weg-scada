import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Maximize, Minimize, Wifi, WifiOff, X } from 'lucide-react'
import { useDrivesStore } from '../../store/drives'
import { useNow } from '../../lib/useNow'
import type { Dibujo } from '../../lib/unifilar'

// Franja superior del modo sala de control: dónde estoy, hora, conexión, pantalla completa y salir
export default function FranjaSala({ dibujo, general, onSalir }: { dibujo: Dibujo; general?: Dibujo; onSalir: () => void }) {
  const connected = useDrivesStore(s => s.connected)
  const ahora = useNow(1000)
  const [completa, setCompleta] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const f = () => setCompleta(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const alternar = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})
  const bt = 'inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:bg-muted'
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5">
        {dibujo.tipo === 'general' ? <span className="font-semibold">{dibujo.nombre}</span> : <>
          <Link to="/unifilar?sala=1" className="text-primary hover:underline">{general?.nombre ?? 'Red general'}</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{dibujo.nombre}</span>
        </>}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="tabular-nums font-semibold">{new Date(ahora).toLocaleTimeString('es-AR', { hour12: false })}</span>
        {connected
          ? <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><Wifi className="h-3.5 w-3.5" />Conectado</span>
          : <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 animate-pulse"><WifiOff className="h-3.5 w-3.5" />Reconectando</span>}
        <button type="button" className={bt} onClick={alternar}>
          {completa ? <><Minimize className="h-3.5 w-3.5" />Salir de pantalla completa</> : <><Maximize className="h-3.5 w-3.5" />Pantalla completa</>}
        </button>
        <button type="button" className={bt} onClick={onSalir}><X className="h-3.5 w-3.5" />Salir</button>
      </div>
    </div>
  )
}
