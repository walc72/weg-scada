// Ruta ortogonal de una conexión del unifilar. Función pura.
// Sale y entra por el eje de cada punto (no por su sentido), así un punto de barra que mira hacia un lado
// no obliga a rodear el símbolo. Pero si un borne mira hacia el lado contrario de la otra punta, primero sale
// SALIDA px hacia su lado y después rodea, para no cruzar el propio símbolo (salvo los puntos de barra p0…).
export type Lado = 'top' | 'bottom' | 'left' | 'right'
const SALIDA = 20

const vertical = (p: Lado) => p === 'top' || p === 'bottom'
const deEspaldas = (x: number, y: number, p: Lado, ox: number, oy: number) =>
  p === 'left' ? ox > x : p === 'right' ? ox < x : p === 'top' ? oy > y : oy < y
const paso = (p: Lado): [number, number] => (p === 'left' ? [-SALIDA, 0] : p === 'right' ? [SALIDA, 0] : p === 'top' ? [0, -SALIDA] : [0, SALIDA])

// → [path, x, y de un punto sobre la línea para la etiqueta]
export function rutaOrto(sx: number, sy: number, sp: Lado, tx: number, ty: number, tp: Lado, sh?: string | null, th?: string | null): [string, number, number] {
  const sv = vertical(sp), tv = vertical(tp)
  const sale = !sh?.startsWith('p') && deEspaldas(sx, sy, sp, tx, ty)
  const entra = !th?.startsWith('p') && deEspaldas(tx, ty, tp, sx, sy)
  if (!sale && !entra) {
    const my = (sy + ty) / 2, mx = (sx + tx) / 2
    return sv && tv ? [`M${sx},${sy} V${my} H${tx} V${ty}`, mx, my]
      : sv ? [`M${sx},${sy} V${ty} H${tx}`, sx, ty]
      : tv ? [`M${sx},${sy} H${tx} V${ty}`, tx, sy]
      : [`M${sx},${sy} H${mx} V${ty} H${tx}`, mx, my]
  }
  const [adx, ady] = sale ? paso(sp) : [0, 0], [bdx, bdy] = entra ? paso(tp) : [0, 0]
  const ax = sx + adx, ay = sy + ady, bx = tx + bdx, by = ty + bdy
  // tras una salida horizontal (o sin salida desde un borne vertical) se sigue en vertical
  const primeroV = sale ? !sv : sv
  const ini = sale ? (sv ? ` V${ay}` : ` H${ax}`) : ''
  const medio = primeroV ? ` V${by} H${bx}` : ` H${bx} V${by}`
  const fin = entra ? (tv ? ` V${ty}` : ` H${tx}`) : ''
  return [`M${sx},${sy}${ini}${medio}${fin}`, primeroV ? ax : (ax + bx) / 2, primeroV ? (ay + by) / 2 : ay]
}
