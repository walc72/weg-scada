// Marco común de los gadgets del Dashboard: tarjeta con título de sección (opcional) y un error
// boundary para que un gadget roto no tire el Dashboard. También los datos compartidos entre gadgets.
import { Component, createContext, useContext, type ReactNode } from 'react'
import { Card } from '../ui/card'
import type { Drive, Meter } from '../../types'
import type { DailyStat } from '@/lib/useDailyEnergy'

export type GadgetProps<O> = { opciones: O; editando: boolean }

// Calculado una vez en el Dashboard (useDailyStats consulta la API: no repetirlo por gadget)
export type DatosDashboard = { driveList: Drive[]; meterList: Meter[]; daily: Map<string, DailyStat> }
export const DatosDashboardCtx = createContext<DatosDashboard>({ driveList: [], meterList: [], daily: new Map() })
export const useDatosDashboard = () => useContext(DatosDashboardCtx)

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card className="p-4 h-full flex flex-col gap-3">
      <h2 className="text-xs font-bold tracking-widest uppercase">{titulo}</h2>
      {children}
    </Card>
  )
}

const Fallo = () => <p className="text-sm text-muted-foreground">No se pudo mostrar este gadget.</p>

class Boundary extends Component<{ titulo: string; children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (!this.state.error) return this.props.children
    return <Seccion titulo={this.props.titulo}><Fallo /></Seccion>
  }
}

// `sinMarco`: el contenido se dibuja tal cual (alarmas, indicadores y los que ya traen su propia tarjeta
// con título: línea de bombeo, medición, gráficos). El título se usa igual si el gadget falla.
// `encabezado`: el usuario le puso título propio a un gadget sin marco → se dibuja arriba.
export default function GadgetMarco({ titulo, sinMarco, encabezado, children }: { titulo: string; sinMarco?: boolean; encabezado?: boolean; children: ReactNode }) {
  const cuerpo = !sinMarco ? <Seccion titulo={titulo}>{children}</Seccion>
    : encabezado ? <div className="flex flex-col gap-2"><h2 className="text-xs font-bold tracking-widest uppercase">{titulo}</h2>{children}</div>
    : children
  return <Boundary titulo={titulo}>{cuerpo}</Boundary>
}
