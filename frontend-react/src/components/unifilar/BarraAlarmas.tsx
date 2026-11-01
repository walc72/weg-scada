import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, WifiOff } from 'lucide-react'
import type { ItemAlarma } from '../../lib/energizar'

// Resumen de novedades del dibujo; tocar un ítem lo ubica en el lienzo (o abre su sitio)
export default function BarraAlarmas({ items, onIr }: { items: ItemAlarma[]; onIr: (i: ItemAlarma) => void }) {
  const [abierta, setAbierta] = useState(false)
  if (!items.length) return null
  const conAlarma = items.filter(i => i.alarmas.length).length
  const sinCom = items.reduce((t, i) => t + i.sinCom, 0)
  return (
    <div className="border text-sm bg-card" style={{ borderColor: 'var(--p1)', boxShadow: 'inset 4px 0 0 var(--p1)' }}>
      <button type="button" onClick={() => setAbierta(a => !a)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <AlertTriangle className="h-4 w-4" style={{ color: 'var(--p1-text)' }} />
        {conAlarma > 0 && <span className="font-bold tracking-wide" style={{ color: 'var(--p1-text)' }}>{conAlarma} con alarma</span>}
        {conAlarma > 0 && sinCom > 0 && <span className="text-muted-foreground">·</span>}
        {sinCom > 0 && <span className="font-semibold" style={{ color: 'var(--st-com)' }}>{sinCom} sin comunicación</span>}
      </button>
      {abierta && (
        <ul className="border-t px-2 py-1">
          {items.map(i => (
            <li key={`${i.id}:${i.nombre}`}>
              <button type="button" onClick={() => onIr(i)} className="flex w-full flex-wrap items-center gap-x-2 px-2 py-1 text-left hover:bg-muted">
                <span className="font-medium">{i.nombre}</span>
                {i.alarmas.length > 0 && <span style={{ color: 'var(--p1-text)' }}>{i.alarmas.join(', ')}</span>}
                {i.sinCom > 0 && <span className="inline-flex items-center gap-1" style={{ color: 'var(--st-com)' }}><WifiOff className="h-3 w-3" />{i.dibujo ? `${i.sinCom} sin comunicación` : 'Sin comunicación'}</span>}
                {i.dibujo && <span className="ml-auto text-xs text-primary">Ver sitio →</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
