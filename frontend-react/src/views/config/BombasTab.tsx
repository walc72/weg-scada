import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { byName } from '../../store/drives'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { SeccionConfig, useAvisoPendiente, useGuardando } from '../../components/config'
import { esSucio } from '../../components/config/useEdicion'
import { FilaGuardado, FueraServicioBtn, PedidoDialog, pedidoBorrar, pedidoHabilitar, type Pedido } from './filas'
import { toast } from 'sonner'
import type { DeviceConfig, DriveType, GatewayKind } from '../../types'
import { useLicense } from '../../store/license'
import { PumpCaudalCell } from './FlowmetersSection'
import { PumpNominalCell } from './PumpNominalCell'
import { EnlaceSelect } from './CommsSection'
import { editarEquipo } from './equipos'

export default function BombasTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const fullB = useLicense(l => l.full('variadores'))
  const hasCaudales = useLicense(l => l.hasModule('caudales'))
  const limitMsg = useLicense(l => l.limitMsg('variadores'))
  const [guardando, correr] = useGuardando()
  const [editOrig, setEditOrig] = useState<string | null>(null)  // nombre original de la fila en edición
  const [editDev, setEditDev] = useState<DeviceConfig | null>(null)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newDev, setNewDev] = useState<DeviceConfig>({
    name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1, enabled: true
  })
  const [useGateway, setUseGateway] = useState(false)
  useAvisoPendiente(editOrig !== null && !!editDev && esSucio(cfg.devices.find(d => d.name === editOrig), editDev))

  // Guarda solo el equipo `name` (sobre la config vigente)
  const conDevice = (name: string, f: (d: DeviceConfig) => DeviceConfig) =>
    store.guardar(c => ({ ...c, devices: editarEquipo(c.devices, name, f) }))

  async function addDevice() {
    if (!newDev.name.trim()) { toast.error('Nombre obligatorio'); return }
    if (cfg.devices.find((d) => d.name === newDev.name.trim())) {
      toast.error('Ya existe un dispositivo con ese nombre'); return
    }
    const nuevo: DeviceConfig = { ...newDev, name: newDev.name.trim(), ...(newDev.gateway ? { enlace: undefined } : {}) }
    if (await store.guardar(c => ({ ...c, devices: [...c.devices, nuevo] }))) {
      toast.success('Dispositivo agregado')
      setShowAdd(false)
      setNewDev({ name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1, enabled: true })
    }
  }

  async function saveEdit() {
    if (!editDev || editOrig === null) return
    const editado = { ...editDev }
    // Por nombre original (renombre); On/Off y fuera de servicio se toman de la config vigente
    if (await conDevice(editOrig, d => ({ ...editado, enabled: d.enabled, fueraServicio: d.fueraServicio }))) {
      toast.success('Actualizado')
      setEditOrig(null)
    }
  }

  function pedirBorrar(name: string) {
    setPedido(pedidoBorrar(name, async () => {
      if (await store.guardar(c => ({ ...c, devices: c.devices.filter(d => d.name !== name) }))) toast.success(`${name} eliminado`)
    }, 'Se quita de la configuración junto con sus datos de conexión. No se puede deshacer.'))
  }

  function pedirEnabled(d: DeviceConfig) {
    const on = d.enabled !== false
    setPedido(pedidoHabilitar(d.name, on, () => conDevice(d.name, x => ({ ...x, enabled: !on }))))
  }

  // Equipo activo que ya usa ese slot (el backend rechaza repetirlo)
  function slotOwner(gwName: string | undefined, slotId: number, exceptName?: string): string | undefined {
    return cfg.devices.find((d) => d.name !== exceptName && d.enabled !== false && d.gateway === gwName && d.slot === slotId)?.name
  }

  return (
    <div className="space-y-2">
      <SeccionConfig titulo="BOMBAS" acciones={
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={fullB} title={fullB ? limitMsg : undefined}><Plus className="h-4 w-4" />AGREGAR BOMBA</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Agregar Dispositivo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nombre</Label><Input value={newDev.name} onChange={(e) => setNewDev({ ...newDev, name: e.target.value })} placeholder="SAER X" /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={newDev.type} onValueChange={(v) => {
                    const t = v as DriveType
                    setNewDev({ ...newDev, type: t })
                    setUseGateway(t === 'SSW900')
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CFW900">CFW900 (IP directa)</SelectItem>
                      <SelectItem value="SSW900">SSW900 (via Gateway PLC)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Gateway selector para SSW900 */}
                {useGateway && cfg.gateways.length > 0 && (
                  <div className="border bg-muted/40 p-3 space-y-2">
                    <Label className="text-[11px] font-bold tracking-widest">GATEWAY</Label>
                    <Select
                      value={`${newDev.ip}:${newDev.port}`}
                      onValueChange={(v) => {
                        const gw = cfg.gateways.find(g => `${g.ip}:${g.port}` === v)
                        if (gw) {
                          const k: GatewayKind = gw.kind ?? 'plc'
                          setNewDev({
                            ...newDev, enlace: undefined, ip: gw.ip, port: gw.port, site: gw.site || newDev.site, gateway: gw.name,
                            slot: undefined,
                            // ADAM: SSW nativo (medidas en 0, estado en Net Id 679). PLC: por slot.
                            regOffset: k === 'adam' ? 0 : undefined,
                            statusOffset: k === 'adam' ? 679 : undefined,
                          })
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Seleccionar gateway..." /></SelectTrigger>
                      <SelectContent>
                        {cfg.gateways.map(g => (
                          <SelectItem key={g.name} value={`${g.ip}:${g.port}`}>
                            {g.name} — {g.ip}:{g.port} · {(g.kind ?? 'plc') === 'plc' ? 'PLC' : 'ADAM'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const selGw = cfg.gateways.find(g => g.name === newDev.gateway)
                      const k: GatewayKind = selGw?.kind ?? 'plc'
                      return (
                        <p className="text-xs text-muted-foreground">
                          {!selGw ? 'Elegí un gateway.' : k === 'plc'
                            ? 'PLC M241: las bombas comparten IP y se diferencian por slot (offsets del PLC).'
                            : 'ADAM4572: cada bomba (variador) es un esclavo Modbus con su propio Unit ID en el bus RS-485.'}
                        </p>
                      )
                    })()}
                  </div>
                )}

                <div>
                  <Label>Sitio</Label>
                  <Select value={newDev.site} onValueChange={(v) => setNewDev({ ...newDev, site: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([
                        ...cfg.gateways.map(g => g.site).filter(Boolean),
                        'Agriplus', 'Agrocaraya'
                      ])).map(s => (
                        <SelectItem key={s} value={s!}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!useGateway && (
                  <div><Label>IP</Label><Input value={newDev.ip} onChange={(e) => setNewDev({ ...newDev, ip: e.target.value })} placeholder="192.168.10.x" className="" /></div>
                )}

                {!useGateway && <div><EnlaceSelect label="Conectado por" value={newDev.enlace} onChange={(v) => setNewDev({ ...newDev, enlace: v })} /></div>}

                <div className="grid grid-cols-2 gap-3">
                  {useGateway
                    ? <div><Label>IP Gateway</Label><Input value={newDev.ip} readOnly className="bg-muted" /></div>
                    : null
                  }
                  <div><Label>Puerto</Label><Input type="number" value={newDev.port} onChange={(e) => setNewDev({ ...newDev, port: +e.target.value })} /></div>
                  <div><Label>Unit ID</Label><Input type="number" value={newDev.unitId} onChange={(e) => setNewDev({ ...newDev, unitId: +e.target.value })} /></div>
                </div>

                {/* SSW900 vía ADAM: se direcciona por Unit ID */}
                {useGateway && (cfg.gateways.find(g => g.name === newDev.gateway)?.kind ?? 'plc') === 'adam' && (
                  <div>
                    <Label>Unit ID (dirección Modbus del variador)</Label>
                    <Input type="number" value={newDev.unitId}
                      onChange={(e) => setNewDev({ ...newDev, unitId: +e.target.value })}
                      placeholder="1, 2, 3..." />
                    <p className="text-xs text-muted-foreground mt-1">Cada SSW900 tiene una dirección única en el bus RS-485. Medidas en base 0, estado en Net Id 679.</p>
                  </div>
                )}

                {useGateway && (cfg.gateways.find(g => g.name === newDev.gateway)?.kind ?? 'plc') === 'plc' && (() => {
                  const selGw = cfg.gateways.find(g => g.name === newDev.gateway)
                  const slots = selGw?.slots ?? []
                  return (
                    <div className="space-y-2">
                      <Label>Slot del PLC</Label>
                      {slots.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Este gateway no tiene slots definidos. Cargalos en <strong>Gateways → Slots (mapa PLC)</strong> (botón <em>Escanear</em>) y volvé a elegir el slot acá.
                        </p>
                      ) : (
                        <>
                          <Select
                            value={newDev.slot != null ? String(newDev.slot) : ''}
                            onValueChange={(v) => setNewDev({ ...newDev, slot: +v, regOffset: undefined, statusOffset: undefined })}
                          >
                            <SelectTrigger><SelectValue placeholder="Seleccionar slot..." /></SelectTrigger>
                            <SelectContent>
                              {slots.map(s => {
                                const owner = slotOwner(newDev.gateway, s.id)
                                return (
                                  <SelectItem key={s.id} value={String(s.id)} disabled={!!owner}>
                                    Slot {s.id}{s.label ? ` — ${s.label}` : ''} (reg {s.regOffset} / st {s.statusOffset}){owner ? ` · usado por ${owner}` : ''}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">El slot referencia el mapa del PLC definido en el gateway; el device no guarda offsets crudos.</p>
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowAdd(false); setUseGateway(false) }}>CANCELAR</Button>
                <Button onClick={() => correr(addDevice)} disabled={guardando}>AGREGAR</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      }>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">On</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead>Sitio</TableHead>
              <TableHead>Conexión</TableHead>
              {hasCaudales && <TableHead>Caudal</TableHead>}
              <TableHead>Nominales</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cfg.devices.map((d, i) => [d, i] as const)
              .sort(([a], [b]) => byName.compare(a.site || '', b.site || '') || byName.compare(a.name, b.name))
              .map(([d, i]) => (
              <TableRow key={d.name + i}>
                <TableCell><Switch checked={d.enabled !== false} disabled={guardando} aria-label={`Habilitar ${d.name}`} onCheckedChange={() => pedirEnabled(d)} /></TableCell>
                {editOrig === d.name && editDev ? (
                  <>
                    <TableCell><Input value={editDev.name} onChange={(e) => setEditDev({ ...editDev, name: e.target.value })} /></TableCell>
                    <TableCell>
                      <Select value={editDev.type} onValueChange={(v) => setEditDev({ ...editDev, type: v as DriveType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CFW900">CFW900</SelectItem>
                          <SelectItem value="SSW900">SSW900</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input value={editDev.site} onChange={(e) => setEditDev({ ...editDev, site: e.target.value })} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <Input value={editDev.ip} onChange={(e) => setEditDev({ ...editDev, ip: e.target.value })} className="h-7 w-36" aria-label="IP" />
                          <Input type="number" value={editDev.port} onChange={(e) => setEditDev({ ...editDev, port: +e.target.value })} className="h-7 w-20" aria-label="Puerto" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground w-7 shrink-0">Unit</span>
                          <Input type="number" value={editDev.unitId} onChange={(e) => setEditDev({ ...editDev, unitId: +e.target.value })} className="w-16 h-7" />
                        </div>
                        {!editDev.gateway && <EnlaceSelect value={editDev.enlace} onChange={(v) => setEditDev({ ...editDev, enlace: v })} className="h-7 w-36 text-xs" />}
                        {editDev.type === 'SSW900' && (() => {
                          const eKind: GatewayKind = cfg.gateways.find(g => g.name === editDev.gateway)?.kind ?? 'plc'
                          return (
                            <>
                              <Select value={editDev.gateway ?? ''} onValueChange={(v) => {
                                const gw = cfg.gateways.find(g => g.name === v); const k: GatewayKind = gw?.kind ?? 'plc'
                                setEditDev({ ...editDev, enlace: undefined, gateway: v, ip: gw?.ip ?? editDev.ip, port: gw?.port ?? editDev.port, slot: undefined, regOffset: k === 'adam' ? 0 : undefined, statusOffset: k === 'adam' ? 679 : undefined })
                              }}>
                                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Gateway" /></SelectTrigger>
                                <SelectContent>{cfg.gateways.map(g => <SelectItem key={g.name} value={g.name}>{g.name} · {(g.kind ?? 'plc') === 'plc' ? 'PLC' : 'ADAM'}</SelectItem>)}</SelectContent>
                              </Select>
                              {eKind === 'plc' ? (
                                <Select value={editDev.slot != null ? String(editDev.slot) : ''} onValueChange={(v) => setEditDev({ ...editDev, slot: +v, regOffset: undefined, statusOffset: undefined })}>
                                  <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Slot" /></SelectTrigger>
                                  <SelectContent>
                                    {(cfg.gateways.find(g => g.name === editDev.gateway)?.slots ?? []).map(s => {
                                      const owner = editDev.enabled !== false ? slotOwner(editDev.gateway, s.id, editOrig) : undefined
                                      return (
                                        <SelectItem key={s.id} value={String(s.id)} disabled={!!owner}>
                                          Slot {s.id}{s.label ? ` — ${s.label}` : ''}{owner ? ` · usado por ${owner}` : ''}
                                        </SelectItem>
                                      )
                                    })}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">por Unit ID (arriba)</span>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </TableCell>
                    {hasCaudales && <TableCell />}
                    <TableCell />
                    <TableCell className="text-right whitespace-nowrap align-top">
                      <FilaGuardado guardando={guardando} onDescartar={() => setEditOrig(null)} onGuardar={() => correr(saveEdit)} />
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-bold">{d.name}</TableCell>
                    <TableCell className="text-center"><Badge variant={'secondary'}>{d.type}</Badge></TableCell>
                    <TableCell>{d.site}</TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap" title={`${d.ip}:${d.port} · unit ${d.unitId}`}>
                      {d.gateway
                        ? <>{d.gateway} · {d.slot != null ? `slot ${d.slot}` : `unit ${d.unitId}`}</>
                        : <>{d.ip}:{d.port} · unit {d.unitId}</>}
                    </TableCell>
                    {hasCaudales && <TableCell><PumpCaudalCell dev={d} /></TableCell>}
                    <TableCell><PumpNominalCell dev={d} /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <FueraServicioBtn on={!!d.fueraServicio} nombre={d.name} disabled={guardando}
                        onCambiar={() => { const fs = !d.fueraServicio; void correr(() => conDevice(d.name, x => ({ ...x, fueraServicio: fs || undefined }))) }} />
                      <Button size="sm" variant="ghost" aria-label={`Editar ${d.name}`} onClick={() => { setEditOrig(d.name); setEditDev({ ...d }) }}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Borrar ${d.name}`} className="text-destructive hover:text-destructive" disabled={guardando} onClick={() => pedirBorrar(d.name)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {cfg.devices.length === 0 && (
              <TableRow><TableCell colSpan={hasCaudales ? 8 : 7} className="py-4 text-center text-sm text-muted-foreground">Todavía no hay bombas.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </SeccionConfig>
      <PedidoDialog pedido={pedido} onCerrar={() => setPedido(null)} correr={correr} />
    </div>
  )
}
