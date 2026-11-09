import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { SeccionConfig, Campo, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import type { GatewayConfig, GatewayKind } from '../../types'
import { EnlaceSelect } from './CommsSection'
import { PedidoDialog, type Pedido } from './filas'
import { GatewaySlots } from './GatewaySlots'
import { editarEquipo } from './equipos'
import { EscaneoAdam } from './GatewayEscaneo'

const NUEVO = { name: '', kind: 'plc' as GatewayKind, ip: '', port: 502, site: '' }

export default function GatewaysTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const [guardando, correr] = useGuardando()
  const [showAdd, setShowAdd] = useState(false)
  const [nuevo, setNuevo] = useState(NUEVO)

  async function agregar() {
    const name = nuevo.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!nuevo.ip.trim()) { toast.error('IP obligatoria'); return }
    if (cfg.gateways.find(g => g.name === name)) { toast.error('Ya existe un gateway con ese nombre'); return }
    const gw: GatewayConfig = { name, ip: nuevo.ip.trim(), port: nuevo.port || 502, site: nuevo.site.trim(), kind: nuevo.kind }
    if (nuevo.kind === 'plc') gw.slots = []
    if (await store.guardar(c => ({ ...c, gateways: [...c.gateways, gw] }))) {
      toast.success('Gateway agregado')
      setShowAdd(false)
      setNuevo(NUEVO)
    }
  }

  return (
    <div className="space-y-4">
      <SeccionConfig titulo={`GATEWAYS (${cfg.gateways.length})`}
        ayuda="Cada gateway se guarda por separado: tipo, enlace, layout del scan y slots quedan pendientes hasta «Guardar»."
        acciones={
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" />AGREGAR GATEWAY</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Agregar gateway</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nombre</Label><Input value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} placeholder="PLC M241 / ADAM ..." /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={nuevo.kind} onValueChange={(v) => setNuevo({ ...nuevo, kind: v as GatewayKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plc">PLC M241 (concentrador · offsets/slots)</SelectItem>
                      <SelectItem value="adam">ADAM4572 (RS-485 · Unit ID)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>IP</Label><Input value={nuevo.ip} onChange={(e) => setNuevo({ ...nuevo, ip: e.target.value })} placeholder="192.168.10.x" className="font-mono" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Puerto</Label><Input type="number" value={nuevo.port} onChange={(e) => setNuevo({ ...nuevo, port: +e.target.value })} className="font-mono" /></div>
                  <div><Label>Sitio</Label><Input value={nuevo.site} onChange={(e) => setNuevo({ ...nuevo, site: e.target.value })} placeholder="Agriplus..." /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAdd(false)}>CANCELAR</Button>
                <Button onClick={() => correr(agregar)} disabled={guardando}>AGREGAR</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }>
        {cfg.gateways.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay gateways.</p>}
      </SeccionConfig>
      {cfg.gateways.map(g => <GatewayEditor key={g.name} gw={g} />)}
    </div>
  )
}

// Un gateway = una sección con su propia edición y su «GUARDAR»
function GatewayEditor({ gw }: { gw: GatewayConfig }) {
  const store = useConfigStore()
  const ed = useEdicion(gw)
  const g = ed.valor
  const kind: GatewayKind = g.kind ?? 'plc'
  const [abierto, setAbierto] = useState(false)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [guardando, correr] = useGuardando()

  const guardar = () => correr(async () => {
    const ok = await ed.guardar(v => store.guardar(c => ({ ...c, gateways: editarEquipo(c.gateways, gw.name, () => v) })))
    if (ok) toast.success(`${gw.name} guardado`)
  })

  function pedirBorrar() {
    const usado = store.config!.devices.filter(d => d.gateway === gw.name).map(d => d.name)
    if (usado.length) { toast.error(`No se puede eliminar: lo usan ${usado.join(', ')}`); return }
    setPedido({
      titulo: `¿Borrar ${gw.name}?`, textoConfirmar: 'BORRAR', peligro: true,
      mensaje: 'Se quita el gateway de la configuración junto con su mapa de slots. No se puede deshacer.',
      accion: async () => {
        if (await store.guardar(c => ({ ...c, gateways: c.gateways.filter(x => x.name !== gw.name) }))) toast.success(`${gw.name} eliminado`)
      },
    })
  }

  return (
    <SeccionConfig titulo={gw.name} acciones={
      <>
        <span className="font-mono text-xs text-muted-foreground">{gw.ip}:{gw.port}</span>
        {gw.site && <Badge variant="secondary">{gw.site}</Badge>}
        <Button size="sm" variant="destructive" disabled={guardando} onClick={pedirBorrar}><Trash2 className="h-4 w-4" />BORRAR</Button>
      </>
    }>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <Campo etiqueta="Tipo">
          <Select value={kind} onValueChange={(v) => ed.set(x => ({ ...x, kind: v as GatewayKind }))}>
            <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="plc">PLC M241 (offsets/slots)</SelectItem>
              <SelectItem value="adam">ADAM4572 (Unit ID)</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <div className="space-y-1.5">
          <EnlaceSelect label="Conectado por" value={g.enlace} onChange={(v) => ed.set(x => ({ ...x, enlace: v }))} />
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}>
        <ChevronRight className={`h-4 w-4 transition-transform ${abierto ? 'rotate-90' : ''}`} />
        {kind === 'plc' ? `SLOTS (${(g.slots ?? []).length})` : 'BOMBAS (RS-485)'}
      </Button>

      {abierto && (kind === 'plc'
        ? <GatewaySlots valor={g} set={ed.set} guardado={gw} bloqueado={ed.sucio} pedir={setPedido} />
        : <EscaneoAdam gw={gw} bloqueado={ed.sucio} pedir={setPedido} />)}

      <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
      <PedidoDialog pedido={pedido} onCerrar={() => setPedido(null)} correr={correr} />
    </SeccionConfig>
  )
}
