import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Estado, SimboloEstado } from '../SimboloEstado'
import type { ItemAlarma } from '../../lib/energizar'

// Resumen de novedades del dibujo; tocar un ítem lo ubica en el lienzo (o abre su sitio).
// Símbolos unificados: alarma de equipo = alta (cuadrado «1», como antes en rojo), sin comunicación = círculo «?»
export default function BarraAlarmas({ items, onIr }: { items: ItemAlarma[]; onIr: (i: ItemAlarma) => void }) {
  const [abierta, setAbierta] = useState(false)
  if (!items.length) return null
  const conAlarma = items.filter(i => i.alarmas.length).length
  const sinCom = items.reduce((t, i) => t + i.sinCom, 0)
  return (
    <div className="border text-sm bg-card" style={{ boxShadow: `inset 4px 0 0 ${conAlarma > 0 ? 'var(--p1)' : 'var(--st-com)'}` }}>
      <button type="button" onClick={() => setAbierta(a => !a)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {conAlarma > 0 && <Estado prioridad="alta" className="font-bold tracking-wide">{conAlarma} con alarma</Estado>}
        {conAlarma > 0 && sinCom > 0 && <span className="text-muted-foreground">·</span>}
        {sinCom > 0 && <Estado prioridad="invalido" className="font-semibold">{sinCom} sin comunicación</Estado>}
      </button>
      {abierta && (
        <ul className="border-t px-2 py-1">
          {items.map(i => (
            <li key={`${i.id}:${i.nombre}`}>
              <button type="button" onClick={() => onIr(i)} className="flex w-full flex-wrap items-center gap-x-2 px-2 py-1 text-left hover:bg-muted">
                <span className="font-medium">{i.nombre}</span>
                {i.alarmas.length > 0 && <span className="hlc-estado hlc-estado--chico"><SimboloEstado prioridad="alta" />{i.alarmas.join(', ')}</span>}
                {i.sinCom > 0 && <span className="hlc-estado hlc-estado--chico"><SimboloEstado prioridad="invalido" />{i.dibujo ? `${i.sinCom} sin comunicación` : 'Sin comunicación'}</span>}
                {i.dibujo && <span className="ml-auto text-xs text-primary">Ver sitio →</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
