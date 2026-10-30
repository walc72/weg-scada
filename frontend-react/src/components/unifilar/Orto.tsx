import { BaseEdge, EdgeLabelRenderer, Position, type Edge, type EdgeProps } from '@xyflow/react'

const vertical = (p: Position) => p === Position.Top || p === Position.Bottom

// En la vista: sentido del flujo (anima la línea) y potencia medida al salir del equipo
export type DatosOrto = { sentido?: 1 | -1; kw?: string }

// Conexión ortogonal armada con la geometría: sale y entra por el eje de cada punto (no por su
// sentido), así un punto de barra que mira hacia un lado no obliga a rodear el símbolo.
export default function Orto({ id, sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition, style, data }: EdgeProps<Edge<DatosOrto>>) {
  const sv = vertical(sourcePosition), tv = vertical(targetPosition)
  const my = (sy + ty) / 2, mx = (sx + tx) / 2
  // [path, punto sobre la línea para la etiqueta]
  const [d, lx, ly] = sv && tv ? [`M${sx},${sy} V${my} H${tx} V${ty}`, mx, my]
    : sv ? [`M${sx},${sy} V${ty} H${tx}`, sx, ty]
    : tv ? [`M${sx},${sy} H${tx} V${ty}`, tx, sy]
    : [`M${sx},${sy} H${mx} V${ty} H${tx}`, mx, my]
  return (
    <>
      <BaseEdge id={id} path={d} style={style} />
      {data?.sentido && (
        <path d={d} fill="none" stroke="hsl(var(--background))" strokeWidth={2} strokeLinecap="round"
          className={`unif-flujo pointer-events-none${data.sentido === -1 ? ' reves' : ''}`} />
      )}
      {data?.kw && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-none absolute rounded bg-card/90 px-1 text-[10px] font-semibold tabular-nums text-foreground shadow-sm"
            style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}>{data.kw}</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
