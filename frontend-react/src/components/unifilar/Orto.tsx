import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { rutaOrto, type Lado } from '../../lib/orto'

// En la vista: sentido del flujo (anima la línea) y potencia medida al salir del equipo
export type DatosOrto = { sentido?: 1 | -1; kw?: string; alerta?: boolean }

// Conexión ortogonal armada con la geometría (ver lib/orto.ts)
export default function Orto({ id, sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition, sourceHandleId, targetHandleId, style, data }: EdgeProps<Edge<DatosOrto>>) {
  const [d, lx, ly] = rutaOrto(sx, sy, sourcePosition as Lado, tx, ty, targetPosition as Lado, sourceHandleId, targetHandleId)
  return (
    <>
      <BaseEdge id={id} path={d} style={style} />
      {data?.sentido && (
        <path d={d} fill="none" stroke="hsl(var(--background))" strokeWidth={2} strokeLinecap="round"
          className={`unif-flujo pointer-events-none${data.sentido === -1 ? ' reves' : ''}`} />
      )}
      {data?.kw && (
        <EdgeLabelRenderer>
          <div className={`nodrag nopan pointer-events-none absolute rounded bg-card/90 px-1 text-[10px] font-semibold tabular-nums shadow-sm ${data.alerta ? 'text-red-600' : 'text-foreground'}`}
            style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}>{data.kw}</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
