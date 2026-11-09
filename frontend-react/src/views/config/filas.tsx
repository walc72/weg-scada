// Piezas de las tablas de equipos de Configuración: confirmación de acciones de fila
// (On/Off, borrar, fuera de servicio) y Guardar/Descartar de la fila en edición.
import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ConfirmarDialog } from '../../components/ui/confirmar-dialog'

export interface Pedido {
  titulo: string; mensaje: string; textoConfirmar: string; peligro?: boolean
  accion: () => Promise<unknown>
}

// Pedidos comunes de las tablas de equipos
export const pedidoHabilitar = (nombre: string, on: boolean, accion: () => Promise<unknown>): Pedido => ({
  titulo: on ? `¿Deshabilitar ${nombre}?` : `¿Habilitar ${nombre}?`,
  mensaje: on ? 'Deja de consultarse: sin lecturas ni alarmas.' : 'Vuelve a consultarse.',
  textoConfirmar: on ? 'DESHABILITAR' : 'HABILITAR', accion,
})
export const pedidoBorrar = (nombre: string, accion: () => Promise<unknown>, mensaje = 'Se quita de la configuración. No se puede deshacer.'): Pedido => ({
  titulo: `¿Borrar ${nombre}?`, mensaje,
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

// Marca «fuera de servicio»: el equipo sigue en pantalla (gris), sin lecturas ni alarmas.
// Pide confirmación; `onCambiar` guarda solo la marca de ese equipo.
export function FueraServicioBtn({ on, nombre, onCambiar, disabled }: { on: boolean; nombre: string; onCambiar: () => void; disabled?: boolean }) {
  const [pedir, setPedir] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" aria-pressed={on} disabled={disabled} onClick={() => setPedir(true)} className={on ? 'bg-muted' : 'text-muted-foreground'}
        aria-label={on ? 'Volver a poner en servicio' : 'Poner fuera de servicio'}
        title={on ? 'Fuera de servicio — clic para volver a ponerlo en servicio' : 'Poner fuera de servicio (sin lecturas ni alarmas)'}>
        <Wrench className="h-3 w-3" />
      </Button>
      <ConfirmarDialog open={pedir}
        titulo={on ? `¿Volver a poner ${nombre} en servicio?` : `¿Poner ${nombre} fuera de servicio?`}
        mensaje={on ? 'Vuelve a leerse y a generar alarmas.' : 'Sigue en pantalla en gris, sin lecturas ni alarmas.'}
        textoConfirmar={on ? 'EN SERVICIO' : 'FUERA DE SERVICIO'}
        onConfirmar={() => { setPedir(false); onCambiar() }} onCancelar={() => setPedir(false)} />
    </>
  )
}
