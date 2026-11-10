import { useDrivesStore } from '../../store/drives'
import { useConfigStore } from '../../store/config'
import { useNow } from '@/lib/useNow'
import { lectura, zonaDe, type Gauge } from '@/lib/gauges'
import { varDe } from '@/lib/misGraficos'
import { useEquipos } from '../GraficoUsuario'
import ArcGauge from '../ArcGauge'
import HalfGauge from '../HalfGauge'
import type { GadgetProps } from './GadgetMarco'

// Ancho mínimo de cada gauge por tamaño (la grilla reparte el resto); línea: más ancha y baja
const MIN_ARCO = { S: 110, M: 140, L: 200 } as const
const MIN_LINEA = { S: 160, M: 220, L: 300 } as const
const MAX_ARCO = { S: 'max-w-[130px]', M: 'max-w-[180px]', L: 'max-w-[260px]' } as const

// Varios gauges (arco o línea), cada uno con su equipo y variable (elegidos en ⚙ opciones)
export default function Gauges({ opciones }: GadgetProps<{ gauges: Gauge[]; estilo: 'arco' | 'linea'; tamano: 'S' | 'M' | 'L' }>) {
  const { estilo, tamano } = opciones
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const campo = useDrivesStore(s => s.campo)
  const config = useConfigStore(s => s.config)
  const equipos = useEquipos()
  const ahora = useNow()
  if (opciones.gauges.length === 0) return <p className="text-sm text-muted-foreground">Sin variables. Elegilas en PERSONALIZAR → ⚙.</p>
  return (
    <div className={`grid ${estilo === 'linea' ? 'gap-x-6 gap-y-4' : 'gap-4'}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${(estilo === 'linea' ? MIN_LINEA : MIN_ARCO)[tamano]}px, 1fr))` }}>
      {opciones.gauges.map((g, i) => {
        const l = lectura(g, { drives, meters, campo }, ahora)
        const v = varDe(g)
        const z = zonaDe(g, config, drives)
        const equipo = equipos[g.src].find(e => e.name === g.name)?.label ?? g.name
        if (estilo === 'linea') {
          const plain = z.green === undefined || z.yellow === undefined
          return (
            <div key={i} className="min-w-0">
              <HalfGauge value={l.valor ?? z.min} label={v?.label ?? g.field} unit={v?.unit ?? ''} min={z.min} max={z.max} redLow={z.redLow}
                green={z.green ?? z.max} yellow={z.yellow ?? z.max} invert={z.invert} bipolar={z.bipolar} suffix={l.sufijo}
                plain={plain} stale={l.stale || l.valor === null} vacio={l.valor === null} big={tamano === 'L'} escala={tamano !== 'S'} />
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate" title={equipo}>{equipo}</div>
            </div>
          )
        }
        return <ArcGauge key={i} valor={l.valor} stale={l.stale} sufijo={l.sufijo} label={v?.label ?? g.field} unit={v?.unit ?? ''}
          equipo={equipo} zona={z} ancho={MAX_ARCO[tamano]} />
      })}
    </div>
  )
}
