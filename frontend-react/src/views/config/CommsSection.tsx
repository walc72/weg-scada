// Configuración → Dispositivos: equipos de comunicación (antenas airMAX / routers RUT)
// y el selector «Conectado por» de los demás equipos. Sin el módulo no se muestra nada.
import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { useDrivesStore } from '../../store/drives'
import { useLicense } from '../../store/license'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, Pencil, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { CommConfig, CommState } from '../../types'
import { SeccionConfig, useGuardando } from '../../components/config'
import { PedidoDialog, pedidoBorrar, pedidoHabilitar, type Pedido } from './filas'
import { editarEquipo, guardarEquipo, renombrarEnlace, usadoPor } from './equipos'

const EMPTY: CommConfig = { name: '', tipo: 'airmax', ip: '', community: '', enabled: true }

// Radix no admite valor vacío: NINGUNO = sin enlace = undefined.
// No muestra nada sin el módulo (el server rechaza guardar comms sin licencia).
const NINGUNO = '__ninguno__'
export function EnlaceSelect({ value, onChange, exclude, className, label }: {
  value?: string; onChange: (v: string | undefined) => void; exclude?: string; className?: string; label?: string
}) {
  const hasModule = useLicense(l => l.hasModule('comunicaciones'))
  const comms = useConfigStore(s => s.config?.comms) || []
  if (!hasModule) return null
  return (
    <>
    {label && <Label>{label}</Label>}
    <Select value={value ?? NINGUNO} onValueChange={(v) => onChange(v === NINGUNO ? undefined : v)}>
      <SelectTrigger title="Conectado por" aria-label="Conectado por" className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NINGUNO}>— ninguno —</SelectItem>
        {comms.filter(c => c.name !== exclude).map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
    </>
  )
}

function stateBadge(c: CommConfig, st?: CommState) {
  if (c.enabled === false) return <Badge variant="secondary">Desactivado</Badge>
  if (st?.license === 'excedido') return <Badge variant="warning">Fuera de licencia</Badge>
  if (!st) return <Badge variant="secondary">Sin datos</Badge>
  return st.online ? <Badge variant="success">ONLINE</Badge> : <Badge variant="destructive">OFFLINE</Badge>
}

export function CommsSection() {
  const store = useConfigStore()
  const cfg = store.config!
  const hasModule = useLicense(l => l.hasModule('comunicaciones'))
  const live = useDrivesStore(s => s.comms)
  const [guardando, correr] = useGuardando()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [form, setForm] = useState<CommConfig | null>(null)
  const [orig, setOrig] = useState<string | null>(null)  // null = nuevo
  if (!hasModule) return null
  const comms = cfg.comms || []

  async function saveForm() {
    if (!form) return
    const name = form.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!form.ip.trim()) { toast.error('IP obligatoria'); return }
    if (comms.some(c => c.name === name && c.name !== orig)) { toast.error('Ya existe un equipo con ese nombre'); return }
    const { community, ...rest } = form
    const comm: CommConfig = { ...rest, name, ip: form.ip.trim(), ...(community?.trim() ? { community: community.trim() } : {}) }
    // Renombre: los `enlace` que apuntaban al nombre viejo van al nuevo, en el mismo guardado
    const ok = await store.guardar(c => {
      const r = orig === null ? c : renombrarEnlace(c, orig, name)
      return { ...r, comms: guardarEquipo(r.comms, orig, comm) }
    })
    if (ok) { toast.success(orig === null ? 'Enlace agregado' : 'Enlace actualizado'
); setForm(null) }
  }

  function pedirBorrar(name: string) {
    const used = usadoPor(cfg, name)
    if (used.length) { toast.error(`No se puede eliminar: lo usan ${used.join(', ')}`); return }
    setPedido(pedidoBorrar(name, async () => {
      if (await store.guardar(c => ({ ...c, comms: (c.comms || []).filter(x => x.name !== name) }))) toast.success(`${name} eliminado`)
    }))
  }

  const pedirEnabled = (x: CommConfig) => setPedido(pedidoHabilitar(x.name, x.enabled !== false,
    () => store.guardar(c => ({ ...c, comms: editarEquipo(c.comms, x.name, y => ({ ...y, enabled: x.enabled === false })) }))))

  return (
    <SeccionConfig titulo={`ENLACES (${comms.length})`} ayuda="Antenas y routers por los que se conectan los demás equipos («Conectado por»)." acciones={
      <Button size="sm" onClick={() => { setOrig(null); setForm({ ...EMPTY }) }}>
        <Plus className="h-4 w-4" />AGREGAR ENLACE
      </Button>
    }>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">On</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Community</TableHead>
            <TableHead>Depende de</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comms.map(c => (
            <TableRow key={c.name}>
              <TableCell><Switch checked={c.enabled !== false} disabled={guardando} aria-label={`Habilitar ${c.name}`} onCheckedChange={() => pedirEnabled(c)} /></TableCell>
              <TableCell className="font-bold text-sm">{c.name}</TableCell>
              <TableCell className="text-sm">{c.tipo === 'airmax' ? 'airMAX' : 'RUT'}</TableCell>
              <TableCell className="text-xs font-mono">{c.ip}</TableCell>
              <TableCell className="text-sm">{c.community || '—'}</TableCell>
              <TableCell className="text-sm">{c.enlace || '—'}</TableCell>
              <TableCell className="text-center">{stateBadge(c, live.get(c.name))}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => { setOrig(c.name); setForm({ ...EMPTY, ...c }) }}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Borrar ${c.name}`} className="text-destructive hover:text-destructive" disabled={guardando} onClick={() => pedirBorrar(c.name)}><Trash2 className="h-3 w-3" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {comms.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-4">Todavía no hay enlaces.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{orig === null ? 'Agregar enlace' : `Editar ${orig}`}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Antena Torre Norte" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as 'airmax' | 'rut' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="airmax">Antena Ubiquiti airMAX</SelectItem>
                  <SelectItem value="rut">Router Teltonika RUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>IP</Label><Input className="font-mono" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.10.x" /></div>
              <div><Label>Community SNMP</Label><Input value={form.community ?? ''} onChange={(e) => setForm({ ...form, community: e.target.value })} placeholder="public" /></div>
            </div>
            <div>
              <Label>Depende de</Label>
              <EnlaceSelect value={form.enlace} exclude={orig ?? form.name.trim()} onChange={(v) => setForm({ ...form, enlace: v })} />
            </div>
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>CANCELAR</Button>
            <Button onClick={() => correr(saveForm)} disabled={guardando}><Save className="h-4 w-4" />GUARDAR</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PedidoDialog pedido={pedido} onCerrar={() => setPedido(null)} correr={correr} />
    </SeccionConfig>
  )
}
