import { colorFase } from '../../lib/paleta'
import type { FilaBanco } from '../../lib/resumenEquipo'
import { ETIQUETA } from './ValoresClave'

const sinDato = (x: string) => (x === '—' ? 'text-(--bar-stale)' : '')

// Una fila por regulador del banco, con el color de su fase
export default function FilasBanco({ filas }: { filas: FilaBanco[] }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 gap-y-1.5 text-sm tabular-nums">
      <span className={ETIQUETA}>Regulador</span>
      <span className={`${ETIQUETA} text-right`}>V</span>
      <span className={`${ETIQUETA} text-right`}>Tap</span>
      <span className={`${ETIQUETA} text-right`}>FP</span>
      {filas.map(f => (
        <div key={f.nombre} className="contents">
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colorFase(f.fase) }} aria-hidden="true" />
            <span className="truncate">{f.nombre}</span>
          </span>
          <span className={`text-right font-semibold ${sinDato(f.v)}`}>{f.v}</span>
          <span className={`text-right font-semibold ${sinDato(f.tap)}`}>{f.tap}</span>
          <span className={`text-right font-semibold ${sinDato(f.fp)}`}>{f.fp}</span>
        </div>
      ))}
    </div>
  )
}
