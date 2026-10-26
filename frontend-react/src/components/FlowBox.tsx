import { Droplets } from 'lucide-react'
import type { Drive } from '../types'
import { useConfigStore } from '../store/config'
import { useDrivesStore, isStale } from '../store/drives'
import { useLicense } from '../store/license'
import { fmtFlow, flowmeterOf, colectorLabel } from '@/lib/flow'

// Cuadro "Caudal" de la tarjeta de bomba (spec caudales §4.1). El estado del
// caudalímetro se toma siempre de su config y su tópico en vivo: el `flowMeter`
// del payload de la bomba no alcanza (un colector desactivado lo sigue enviando).
// stale: la bomba está desactualizada (lo calcula DriveCard); el caudalímetro
// también se marca desactualizado si su último dato es viejo (mismo umbral).
export default function FlowBox({ d, stale = false, now = Date.now() }: { d: Drive; stale?: boolean; now?: number }) {
  const hasModule = useLicense(l => l.hasModule('caudales'))
  const cfg = useConfigStore(s => s.config)
  const fm = flowmeterOf(cfg, d.name)
  const st = useDrivesStore(s => (fm ? s.flowmeters.get(fm.name) : undefined))
  const caudal = cfg?.devices.find(x => x.name === d.name)?.caudal
  if (!hasModule || (!caudal && !fm)) return null

  const manual = caudal?.modo === 'manual'
  // Manual sin nominal (ausente o 0): la bomba no informa caudal
  if (manual && !(Number(caudal?.nominal) > 0)) return null
  const colector = !manual && !!fm && fm.bombas.length > 1
  let value: number | undefined
  let problem = ''
  if (manual) value = d.flow
  else if (!fm) problem = 'Sin caudalímetro'
  else if (fm.enabled === false) problem = 'Caudalímetro desactivado'
  else if (st?.license === 'excedido') problem = 'Fuera de licencia'
  else if (!st || !st.online) problem = st?.sinEnlace ? 'Sin enlace' : 'Caudalímetro sin comunicación'
  else if (st.error || st.flow == null) problem = st.error ? `Sin señal (código ${st.error})` : 'Sin señal'
  else value = st.flow

  const fmStale = !manual && !!fm && !!st?.online && isStale(st.ts, now, d.pollMs)
  const grey = stale || fmStale
  const label = grey ? 'Desactualizado' : manual ? 'Manual' : colector ? colectorLabel(fm!.name) : 'Real'
  const others = colector ? fm!.bombas.filter(b => b !== d.name) : []

  return (
    <div className="mx-3 mb-2 bg-muted/50 rounded-md px-2.5 py-2 border-l-[3px] flex items-center justify-between gap-2"
      style={{ borderLeftColor: grey ? '#9ca3af' : problem ? '#f59e0b' : '#0ea5e9' }}>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
          <Droplets className="h-3 w-3" />Caudal
        </div>
        {problem
          ? <div className={`text-sm font-semibold leading-tight ${grey ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>{problem}</div>
          : <div className={`text-lg font-semibold tabular-nums leading-tight ${grey ? 'text-muted-foreground' : ''}`}>{fmtFlow(value)} <span className="text-xs font-normal text-muted-foreground">m³/h</span></div>}
      </div>
      <div className="text-right text-[11px] text-muted-foreground min-w-0">
        <div className={`font-medium truncate ${grey ? '' : 'text-foreground'}`}>{label}</div>
        {others.length > 0 && <div className="truncate" title={others.join(', ')}>compartido con {others.join(', ')}</div>}
      </div>
    </div>
  )
}
