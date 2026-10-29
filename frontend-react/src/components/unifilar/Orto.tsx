import { BaseEdge, Position, type EdgeProps } from '@xyflow/react'

const vertical = (p: Position) => p === Position.Top || p === Position.Bottom

// Conexión ortogonal armada con la geometría: sale y entra por el eje de cada punto (no por su
// sentido), así un punto de barra que mira hacia un lado no obliga a rodear el símbolo.
export default function Orto({ id, sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition, style }: EdgeProps) {
  const sv = vertical(sourcePosition), tv = vertical(targetPosition)
  const d = sv && tv ? `M${sx},${sy} V${(sy + ty) / 2} H${tx} V${ty}`
    : sv ? `M${sx},${sy} V${ty} H${tx}`
    : tv ? `M${sx},${sy} H${tx} V${ty}`
    : `M${sx},${sy} H${(sx + tx) / 2} V${ty} H${tx}`
  return <BaseEdge id={id} path={d} style={style} />
}
