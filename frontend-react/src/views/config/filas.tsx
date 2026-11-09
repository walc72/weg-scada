// Piezas de las tablas de equipos de Configuración (Bombas, Medidores): confirmación de
// acciones de fila (On/Off, borrar) y Guardar/Descartar de la fila en edición.
import { Button } from '../../components/ui/button'
import { ConfirmarDialog } from '../../components/ui/confirmar-dialog'

export interface Pedido {
  titulo: string; mensaje: string; textoConfirmar: string; peligro?: boolean
  accion: () => Promise<unknown>
}

// Pedidos comunes de las tablas de equipos de campo (Caudalímetros, Reconectadores, Reguladores, Generadores, Enlaces)
export const pedidoHabilitar = (nombre: string, on: boolean, accion: () => Promise<unknown>): Pedido => ({
  titulo: on ? `¿Deshabilitar ${nombre}?` : `¿Habilitar ${nombre}?`,
  mensaje: on ? 'Deja de consultarse: sin lecturas ni alarmas.' : 'Vuelve a consultarse.',
  textoConfirmar: on ? 'DESHABILITAR' : 'HABILITAR', accion,
})
export const pedidoBorrar = (nombre: string, accion: () => Promise<unknown>): Pedido => ({
  titulo: `¿Borrar ${nombre}?`, mensaje: 'Se quita de la configuración. No se puede deshacer.',
  textoConfirmar: 'BORRAR', peligro: true, accion,
})

export function PedidoDialog({ pedido, onCerrar, correr }: {
  pedido: Pedido | null; onCerrar: () => void; correr: (fn: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <ConfirmarDialog open={!!pedido} titulo={pedido?.titulo ?? ''} mensaje={pedido?.mensaje ?? ''}
      textoConfirmar={pedido?.textoConfirmar} peligro={pedido?.peligro}
      onConfirmar={() => { if (pedido) void correr(pedido.accion); onCerrar() }} onCancelar={onCerrar} />
  )
}

// Igual que BarraGuardado, compacta para la celda de acciones
export function FilaGuardado({ guardando, onDescartar, onGuardar }: { guardando: boolean; onDescartar: () => void; onGuardar: () => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onDescartar} disabled={guardando}>DESCARTAR</Button>
      <Button size="sm" onClick={onGuardar} disabled={guardando}>GUARDAR</Button>
    </div>
  )
}
