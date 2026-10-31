import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useDrivesStore, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useServerStore } from '../store/server'
import PM8000Card from '../components/PM8000Card'
import FormaOnda from './FormaOnda'
import { useDailyStats } from '@/lib/useDailyEnergy'

// Detalle de un medidor: su medición y la forma de onda (solo PM8000/PM7400 la leen)
export default function MedidorDetalle() {
  const { name = '' } = useParams()
  const meters = useDrivesStore(s => s.meters)
  const config = useConfigStore(s => s.config)
  const meterList = useMemo(() => selectMeterList(meters), [meters])
  const m = meterList.find(x => x.name === name)
  const daily = useDailyStats([], m ? [m] : [])
  const cfg = config?.meters?.find(c => c.name === name)
  const titulo = cfg?.ui?.title || (config as any)?.meterNames?.[name] || name
  const onda = cfg?.type === 'PM8000' || cfg?.type === 'PM7400'
  // la réplica de oficina no tiene poller Modbus: no puede pedirle la onda al medidor
  const replica = useServerStore(s => s.replica)

  if (!m) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <div>No se encontró el medidor «{name}».</div>
        <Link to="/equipos?tab=medidores" className="text-sm underline">Volver a Equipos</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card border px-4 py-3">
        <Link to="/equipos?tab=medidores" className="inline-flex items-center gap-1 border border-border bg-background px-2.5 min-h-[32px] text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent"><ChevronLeft className="h-4 w-4" />EQUIPOS</Link>
        <h1 className="text-[22px] font-bold tracking-wide">{titulo}</h1>
        {cfg?.type && <span className="text-[11px] font-mono text-muted-foreground uppercase">Medidor · {cfg.type}</span>}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="min-w-0" style={{ flex: '1 1 380px' }}>
          <PM8000Card m={m} zones={cfg?.ui?.zones} meterName={titulo} energyKwh={daily.get(name)?.energyKwh} maxPowerKw={daily.get(name)?.maxPowerKw ?? undefined} hero vertical />
        </div>
        <div className="min-w-0" style={{ flex: '999 1 600px' }}>
          {onda && !replica
            ? <FormaOnda meter={name} />
            : <div className="bg-card border px-4 py-6 text-sm text-muted-foreground">
                {onda ? 'La forma de onda se lee en directo del medidor: solo está disponible en el servidor de planta.' : 'Este modelo de medidor no entrega forma de onda.'}
              </div>}
        </div>
      </div>
    </div>
  )
}
