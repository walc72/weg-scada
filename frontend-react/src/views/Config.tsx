import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/config'
import { authFetch } from '../store/auth'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import { Plus, Trash2, Pencil, Save, X, ChevronRight, RotateCcw, ScanSearch, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import type { DeviceConfig, DriveType, AppConfig, GatewayConfig, GatewaySlot, GatewayKind } from '../types'
import { GAUGE_DEFAULTS } from '../lib/gaugeDefaults'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

function gaugeListFor(type: DriveType) {
  const list: Array<{ key: string; label: string; unit: string }> = []
  if (type === 'CFW900') list.push({ key: 'velocidad', label: 'Velocidad', unit: 'RPM' })
  list.push({ key: 'corriente', label: 'Corriente', unit: 'A' })
  list.push({ key: 'tension', label: 'Tensión', unit: 'V' })
  if (type === 'CFW900') list.push({ key: 'frecuencia', label: 'Frecuencia', unit: 'Hz' })
  return list
}

export default function Config() {
  const store = useConfigStore()

  useEffect(() => { if (!store.config) store.load() }, [])

  // Sin gate de contraseña propio: la ruta /config ya es solo-admin (por rol).

  if (store.error) {
    return <div className="text-center text-destructive py-16">Error al cargar configuración: {store.error}</div>
  }

  if (!store.config) {
    return <div className="text-center text-muted-foreground py-16">Cargando configuración...</div>
  }

  return (
    <Tabs defaultValue="devices" className="space-y-4">
      <TabsList>
        <TabsTrigger value="devices">Dispositivos</TabsTrigger>
        <TabsTrigger value="zones">Zonas de Gauges</TabsTrigger>
        <TabsTrigger value="users">Usuarios</TabsTrigger>
        <TabsTrigger value="smtp">Correo</TabsTrigger>
      </TabsList>

      <TabsContent value="devices"><DevicesTab /></TabsContent>
      <TabsContent value="zones"><ZonesTab /></TabsContent>
      <TabsContent value="users"><UsersTab /></TabsContent>
      <TabsContent value="smtp"><SmtpTab /></TabsContent>
    </Tabs>
  )
}

// ─── Devices Tab ────────────────────────────────────────────────
type MeterRow = { name: string; displayName: string; ip: string; port: number; unitId: number; enabled: boolean }

function DevicesTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const [editIdx, setEditIdx] = useState(-1)
  const [editDev, setEditDev] = useState<DeviceConfig | null>(null)
  const [editMeterIdx, setEditMeterIdx] = useState(-1)
  const [editMeter, setEditMeter] = useState<MeterRow | null>(null)
  const [openGW, setOpenGW] = useState(true)
  const [openDev, setOpenDev] = useState(true)
  const [openMeters, setOpenMeters] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddMeter, setShowAddMeter] = useState(false)
  const [newMeter, setNewMeter] = useState<{ name: string; type: 'PM8000' | 'PM7400'; ip: string; port: number; unitId: number; site: string }>({
    name: '', type: 'PM8000', ip: '', port: 502, unitId: 1, site: ''
  })
  const [newDev, setNewDev] = useState<DeviceConfig>({
    name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1, enabled: true
  })
  const [useGateway, setUseGateway] = useState(false)
  const [showAddGw, setShowAddGw] = useState(false)
  const [newGw, setNewGw] = useState<{ name: string; kind: GatewayKind; ip: string; port: number; site: string }>({ name: '', kind: 'plc', ip: '', port: 502, site: '' })
  const [slotsGw, setSlotsGw] = useState<string | null>(null)  // gateway con panel de slots abierto
  const [gwScan, setGwScan] = useState<{ gw: string | null; loading: boolean; results: any[] }>({ gw: null, loading: false, results: [] })

  async function addDevice() {
    if (!newDev.name.trim()) { toast.error('Nombre obligatorio'); return }
    if (cfg.devices.find((d) => d.name === newDev.name.trim())) {
      toast.error('Ya existe un dispositivo con ese nombre'); return
    }
    cfg.devices.push({ ...newDev, name: newDev.name.trim() })
    if (await store.save()) {
      toast.success('Dispositivo agregado')
      setShowAdd(false)
      setNewDev({ name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1, enabled: true })
    }
  }

  async function saveEdit(i: number) {
    if (!editDev) return
    cfg.devices[i] = { ...editDev }
    if (await store.save()) {
      toast.success('Actualizado')
      setEditIdx(-1)
    }
  }

  async function delDevice(name: string) {
    if (!confirm(`¿Eliminar ${name}?`)) return
    const i = cfg.devices.findIndex((d) => d.name === name)
    if (i >= 0) {
      cfg.devices.splice(i, 1)
      if (await store.save()) toast.success(`${name} eliminado`)
    }
  }

  async function toggleEnabled(d: DeviceConfig) {
    d.enabled = !d.enabled
    await store.save()
  }

  // ── Alta/baja de gateways ───────────────────────────────────────────
  async function addGateway() {
    const name = newGw.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!newGw.ip.trim()) { toast.error('IP obligatoria'); return }
    if (cfg.gateways.find(g => g.name === name)) { toast.error('Ya existe un gateway con ese nombre'); return }
    const gw: GatewayConfig = { name, ip: newGw.ip.trim(), port: newGw.port || 502, site: newGw.site.trim(), kind: newGw.kind }
    if (newGw.kind === 'plc') gw.slots = []
    store.setConfig({ ...cfg, gateways: [...cfg.gateways, gw] })
    if (await store.save()) {
      toast.success('Gateway agregado')
      setShowAddGw(false)
      setNewGw({ name: '', kind: 'plc', ip: '', port: 502, site: '' })
    }
  }
  async function delGateway(name: string) {
    const used = cfg.devices.filter(d => d.gateway === name).map(d => d.name)
    if (used.length) { toast.error(`No se puede eliminar: lo usan ${used.join(', ')}`); return }
    if (!confirm(`¿Eliminar el gateway ${name}?`)) return
    store.setConfig({ ...cfg, gateways: cfg.gateways.filter(g => g.name !== name) })
    if (await store.save()) toast.success(`${name} eliminado`)
  }

  // ── Tipo de gateway (plc concentrador vs adam RS-485) ───────────────
  async function setGatewayKind(gwName: string, kind: GatewayKind) {
    const gateways = cfg.gateways.map(g => g.name === gwName ? { ...g, kind } : g)
    store.setConfig({ ...cfg, gateways })
    if (await store.save()) toast.success('Tipo de gateway actualizado')
  }

  // ── Slots del gateway PLC (mapa id -> offsets) ──────────────────────
  function slotsOf(gwName: string): GatewaySlot[] {
    return cfg.gateways.find(g => g.name === gwName)?.slots ?? []
  }
  async function saveSlots(gwName: string, slots: GatewaySlot[]) {
    const gateways = cfg.gateways.map(g => g.name === gwName ? { ...g, slots } : g)
    store.setConfig({ ...cfg, gateways })
    if (await store.save()) toast.success('Slots guardados')
  }
  function addSlot(gw: GatewayConfig) {
    const slots = slotsOf(gw.name)
    const nextId = slots.length ? Math.max(...slots.map(s => s.id)) + 1 : 0
    saveSlots(gw.name, [...slots, { id: nextId, regOffset: nextId * 70, statusOffset: 140 + nextId * 12 }])
  }
  function updateSlot(gwName: string, idx: number, patch: Partial<GatewaySlot>) {
    const slots = slotsOf(gwName).map((s, i) => i === idx ? { ...s, ...patch } : s)
    const gateways = cfg.gateways.map(g => g.name === gwName ? { ...g, slots } : g)
    store.setConfig({ ...cfg, gateways })
  }
  async function delSlot(gwName: string, idx: number) {
    await saveSlots(gwName, slotsOf(gwName).filter((_, i) => i !== idx))
  }
  async function scanGwSlots(gw: GatewayConfig) {
    setGwScan({ gw: gw.name, loading: true, results: [] })
    try {
      const r = await authFetch(`${API_BASE}/config/scan-gateway`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: gw.ip, port: gw.port, unitId: 1 }),
      })
      const data = await r.json()
      const found = (data.slots || []).filter((s: any) => s.detected)
      setGwScan({ gw: gw.name, loading: false, results: data.slots || [] })
      toast.success(`Scan: ${found.length} slot${found.length !== 1 ? 's' : ''} detectado${found.length !== 1 ? 's' : ''}`)
    } catch {
      toast.error('Error al escanear el gateway')
      setGwScan({ gw: gw.name, loading: false, results: [] })
    }
  }
  function applyScan(gw: GatewayConfig) {
    const slots: GatewaySlot[] = gwScan.results.filter((s: any) => s.detected)
      .map((s: any) => ({ id: s.slot, regOffset: s.regOffset, statusOffset: s.statusOffset }))
    saveSlots(gw.name, slots)
    setGwScan({ gw: null, loading: false, results: [] })
  }

  function meterRows(): MeterRow[] {
    return cfg.meters.map(m => ({
      name: m.name,
      displayName: (cfg as any).meterNames?.[m.name] ?? '',
      ip: m.ip,
      port: m.port,
      unitId: m.unitId,
      enabled: (m as any).enabled !== false,
    }))
  }

  async function saveMeterEdit(i: number) {
    if (!editMeter) return
    const newMeters = cfg.meters.map((m, idx) => idx === i ? { ...m, ip: editMeter.ip, port: editMeter.port, unitId: editMeter.unitId, enabled: editMeter.enabled } : m)
    const newNames: Record<string, string> = { ...(cfg as any).meterNames }
    if (editMeter.displayName) newNames[editMeter.name] = editMeter.displayName
    else delete newNames[editMeter.name]
    store.setConfig({ ...cfg, meters: newMeters, meterNames: newNames })
    if (await store.save()) { toast.success('Medidor actualizado'); setEditMeterIdx(-1) }
  }

  async function toggleMeter(i: number) {
    const newMeters = cfg.meters.map((m, idx) => idx === i ? { ...m, enabled: !((m as any).enabled !== false) } : m)
    store.setConfig({ ...cfg, meters: newMeters })
    await store.save()
  }

  async function addMeter() {
    const name = newMeter.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!newMeter.ip.trim()) { toast.error('IP obligatoria'); return }
    if (cfg.meters.find(m => m.name === name)) { toast.error('Ya existe un medidor con ese nombre'); return }
    const meter: AppConfig['meters'][number] = {
      name,
      type: newMeter.type,
      ip: newMeter.ip.trim(),
      port: newMeter.port || 502,
      unitId: newMeter.unitId,
      enabled: true,
      // Mapa de registros estándar PM (1-based): V/I/P/FP/frecuencia
      regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150, freq: 3110 },
    }
    if (newMeter.site.trim()) meter.site = newMeter.site.trim()
    store.setConfig({ ...cfg, meters: [...cfg.meters, meter] })
    if (await store.save()) {
      toast.success('Medidor agregado')
      setShowAddMeter(false)
      setNewMeter({ name: '', type: 'PM8000', ip: '', port: 502, unitId: 1, site: '' })
    }
  }

  async function delMeter(name: string) {
    if (!confirm(`¿Eliminar ${name}?`)) return
    const newMeters = cfg.meters.filter(m => m.name !== name)
    const newNames: Record<string, string> = { ...(cfg as any).meterNames }
    delete newNames[name]
    store.setConfig({ ...cfg, meters: newMeters, meterNames: newNames })
    if (await store.save()) toast.success(`${name} eliminado`)
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-hidden">
        <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
          <button onClick={() => setOpenGW(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
            <ChevronRight className={`h-4 w-4 transition-transform ${openGW ? 'rotate-90' : ''}`} />
            Gateways <span className="text-xs text-muted-foreground">({cfg.gateways.length})</span>
          </button>
          <Dialog open={showAddGw} onOpenChange={setShowAddGw}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" />Agregar Gateway</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Agregar Gateway</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nombre</Label><Input value={newGw.name} onChange={(e) => setNewGw({ ...newGw, name: e.target.value })} placeholder="PLC M241 / ADAM ..." /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={newGw.kind} onValueChange={(v) => setNewGw({ ...newGw, kind: v as GatewayKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plc">PLC M241 (concentrador · offsets/slots)</SelectItem>
                      <SelectItem value="adam">ADAM4572 (RS-485 · Unit ID)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>IP</Label><Input value={newGw.ip} onChange={(e) => setNewGw({ ...newGw, ip: e.target.value })} placeholder="192.168.10.x" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Puerto</Label><Input type="number" value={newGw.port} onChange={(e) => setNewGw({ ...newGw, port: +e.target.value })} /></div>
                  <div><Label>Sitio</Label><Input value={newGw.site} onChange={(e) => setNewGw({ ...newGw, site: e.target.value })} placeholder="Agriplus..." /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowAddGw(false)}>Cancelar</Button>
                <Button onClick={addGateway}>Agregar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {openGW && (
          <div className="divide-y">
            {cfg.gateways.map((g) => {
              const kind: GatewayKind = g.kind ?? 'plc'
              const slots = g.slots ?? []
              const open = slotsGw === g.name
              return (
                <div key={g.name} className="px-4 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-sm text-muted-foreground">{g.ip}:{g.port}</span>
                    {g.site && <Badge variant="secondary">{g.site}</Badge>}
                    <Select value={kind} onValueChange={(v) => setGatewayKind(g.name, v as GatewayKind)}>
                      <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plc">PLC M241 (offsets/slots)</SelectItem>
                        <SelectItem value="adam">ADAM4572 (Unit ID)</SelectItem>
                      </SelectContent>
                    </Select>
                    {kind === 'plc' && (
                      <span className="text-xs text-muted-foreground">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {kind === 'plc' ? (
                        <Button size="sm" variant="outline" onClick={() => setSlotsGw(open ? null : g.name)}>
                          <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} /> Slots (mapa PLC)
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Cada drive por Unit ID (RS-485)</span>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" title="Eliminar gateway" onClick={() => delGateway(g.name)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>

                  {kind === 'plc' && open && (
                    <div className="mt-3 rounded-md border p-3 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slots — id → offsets del PLC</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={gwScan.loading && gwScan.gw === g.name} onClick={() => scanGwSlots(g)}>
                            {gwScan.loading && gwScan.gw === g.name ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ScanSearch className="h-3 w-3 mr-1" />}
                            Escanear
                          </Button>
                          <Button size="sm" onClick={() => addSlot(g)}><Plus className="h-3 w-3 mr-1" />Slot</Button>
                        </div>
                      </div>

                      {slots.length === 0
                        ? <p className="text-xs text-muted-foreground">Sin slots. Escaneá el gateway o agregá manualmente.</p>
                        : (
                          <table className="w-full text-xs">
                            <thead><tr className="text-muted-foreground border-b">
                              <th className="text-left py-1">ID</th><th className="text-left py-1">Reg Offset</th>
                              <th className="text-left py-1">Status Offset</th><th className="text-left py-1">Etiqueta</th><th></th>
                            </tr></thead>
                            <tbody>
                              {slots.map((s, i) => (
                                <tr key={i} className="border-b border-border/40">
                                  <td className="py-1 pr-2"><Input type="number" value={s.id} onChange={e => updateSlot(g.name, i, { id: +e.target.value })} className="w-14 h-7" /></td>
                                  <td className="py-1 pr-2"><Input type="number" value={s.regOffset} onChange={e => updateSlot(g.name, i, { regOffset: +e.target.value })} className="w-20 h-7" /></td>
                                  <td className="py-1 pr-2"><Input type="number" value={s.statusOffset} onChange={e => updateSlot(g.name, i, { statusOffset: +e.target.value })} className="w-20 h-7" /></td>
                                  <td className="py-1 pr-2"><Input value={s.label ?? ''} onChange={e => updateSlot(g.name, i, { label: e.target.value })} className="w-28 h-7" placeholder="opcional" /></td>
                                  <td className="py-1 text-right"><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => delSlot(g.name, i)}><Trash2 className="h-3 w-3" /></Button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      }
                      {slots.length > 0 && <Button size="sm" onClick={() => saveSlots(g.name, slotsOf(g.name))}><Save className="h-3 w-3 mr-1" />Guardar slots</Button>}

                      {gwScan.gw === g.name && gwScan.results.length > 0 && (
                        <div className="rounded border p-2 bg-background">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold">Scan: {gwScan.results.filter((s: any) => s.detected).length} detectados</span>
                            <Button size="sm" onClick={() => applyScan(g)}>Usar estos slots</Button>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {gwScan.results.filter((s: any) => s.detected).map((s: any) => (
                              <span key={s.slot} className="inline-block mr-3">slot {s.slot}: reg {s.regOffset}/st {s.statusOffset} ({s.current ?? '-'}A)</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-hidden">
        <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
          <button onClick={() => setOpenDev(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
            <ChevronRight className={`h-4 w-4 transition-transform ${openDev ? 'rotate-90' : ''}`} />
            Dispositivos <span className="text-xs text-muted-foreground">({cfg.devices.length})</span>
          </button>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" />Agregar Drive</Button>
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
                  <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
                    <Label className="text-blue-700 dark:text-blue-400 font-semibold">Gateway</Label>
                    <Select
                      value={`${newDev.ip}:${newDev.port}`}
                      onValueChange={(v) => {
                        const gw = cfg.gateways.find(g => `${g.ip}:${g.port}` === v)
                        if (gw) {
                          const k: GatewayKind = gw.kind ?? 'plc'
                          setNewDev({
                            ...newDev, ip: gw.ip, port: gw.port, site: gw.site || newDev.site, gateway: gw.name,
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
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          {!selGw ? 'Elegí un gateway.' : k === 'plc'
                            ? 'PLC M241: los drives comparten IP y se diferencian por slot (offsets del PLC).'
                            : 'ADAM4572: cada drive es un esclavo Modbus con su propio Unit ID en el bus RS-485.'}
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
                    <Label>Unit ID (dirección Modbus del drive)</Label>
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
                              {slots.map(s => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  Slot {s.id}{s.label ? ` — ${s.label}` : ''} (reg {s.regOffset} / st {s.statusOffset})
                                </SelectItem>
                              ))}
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
                <Button variant="ghost" onClick={() => { setShowAdd(false); setUseGateway(false) }}>Cancelar</Button>
                <Button onClick={addDevice}>Agregar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {openDev && <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">On</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead>Sitio</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="text-center">Puerto</TableHead>
              <TableHead className="text-center">Unit</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cfg.devices.map((d, i) => (
              <TableRow key={d.name + i}>
                <TableCell><Switch checked={d.enabled !== false} onCheckedChange={() => toggleEnabled(d)} /></TableCell>
                {editIdx === i && editDev ? (
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
                    <TableCell><Input value={editDev.ip} onChange={(e) => setEditDev({ ...editDev, ip: e.target.value })} className="" /></TableCell>
                    <TableCell><Input type="number" value={editDev.port} onChange={(e) => setEditDev({ ...editDev, port: +e.target.value })} className="w-20" /></TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground w-7 shrink-0">Unit</span>
                          <Input type="number" value={editDev.unitId} onChange={(e) => setEditDev({ ...editDev, unitId: +e.target.value })} className="w-16 h-7" />
                        </div>
                        {editDev.type === 'SSW900' && (() => {
                          const eKind: GatewayKind = cfg.gateways.find(g => g.name === editDev.gateway)?.kind ?? 'plc'
                          return (
                            <>
                              <Select value={editDev.gateway ?? ''} onValueChange={(v) => {
                                const gw = cfg.gateways.find(g => g.name === v); const k: GatewayKind = gw?.kind ?? 'plc'
                                setEditDev({ ...editDev, gateway: v, ip: gw?.ip ?? editDev.ip, port: gw?.port ?? editDev.port, slot: undefined, regOffset: k === 'adam' ? 0 : undefined, statusOffset: k === 'adam' ? 679 : undefined })
                              }}>
                                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Gateway" /></SelectTrigger>
                                <SelectContent>{cfg.gateways.map(g => <SelectItem key={g.name} value={g.name}>{g.name} · {(g.kind ?? 'plc') === 'plc' ? 'PLC' : 'ADAM'}</SelectItem>)}</SelectContent>
                              </Select>
                              {eKind === 'plc' ? (
                                <Select value={editDev.slot != null ? String(editDev.slot) : ''} onValueChange={(v) => setEditDev({ ...editDev, slot: +v, regOffset: undefined, statusOffset: undefined })}>
                                  <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Slot" /></SelectTrigger>
                                  <SelectContent>
                                    {(cfg.gateways.find(g => g.name === editDev.gateway)?.slots ?? []).map(s => (
                                      <SelectItem key={s.id} value={String(s.id)}>Slot {s.id}{s.label ? ` — ${s.label}` : ''}</SelectItem>
                                    ))}
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
                    <TableCell className="text-right whitespace-nowrap align-top">
                      <Button size="sm" onClick={() => saveEdit(i)}><Save className="h-3 w-3" />Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditIdx(-1)}><X className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-bold">{d.name}</TableCell>
                    <TableCell className="text-center"><Badge variant={'secondary'}>{d.type}</Badge></TableCell>
                    <TableCell>{d.site}</TableCell>
                    <TableCell className="text-sm">{d.ip}</TableCell>
                    <TableCell className="text-center">{d.port}</TableCell>
                    <TableCell className="text-center">
                      {d.unitId}
                      {d.type === 'SSW900' && d.slot != null && (
                        <div className="text-[10px] text-muted-foreground" title={`Slot ${d.slot} en ${d.gateway ?? 'gateway'}`}>slot {d.slot}</div>
                      )}
                      {d.type === 'SSW900' && d.slot == null && (d.regOffset != null || d.statusOffset != null) && (
                        <div className="text-[10px] text-muted-foreground" title="Offsets crudos (override)">off {d.regOffset ?? 0}/{d.statusOffset ?? 0}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => { setEditIdx(i); setEditDev({ ...d }) }}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => delDevice(d.name)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>

      <div className="border rounded-md overflow-hidden">
        <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
          <button onClick={() => setOpenMeters(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
            <ChevronRight className={`h-4 w-4 transition-transform ${openMeters ? 'rotate-90' : ''}`} />
            Medidores <span className="text-xs text-muted-foreground">({cfg.meters.length})</span>
          </button>
          <Dialog open={showAddMeter} onOpenChange={setShowAddMeter}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" />Agregar Medidor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Agregar Medidor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nombre</Label><Input value={newMeter.name} onChange={(e) => setNewMeter({ ...newMeter, name: e.target.value })} placeholder="PM ..." /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={newMeter.type} onValueChange={(v) => setNewMeter({ ...newMeter, type: v as 'PM8000' | 'PM7400' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PM8000">PM8000</SelectItem>
                      <SelectItem value="PM7400">PM7400</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>IP</Label><Input value={newMeter.ip} onChange={(e) => setNewMeter({ ...newMeter, ip: e.target.value })} className="" placeholder="192.168.10.x" /></div>
                <div className="flex gap-3">
                  <div className="flex-1"><Label>Puerto</Label><Input type="number" value={newMeter.port} onChange={(e) => setNewMeter({ ...newMeter, port: +e.target.value })} /></div>
                  <div className="flex-1"><Label>Unit ID</Label><Input type="number" value={newMeter.unitId} onChange={(e) => setNewMeter({ ...newMeter, unitId: +e.target.value })} /></div>
                </div>
                <div><Label>Sitio (opcional)</Label><Input value={newMeter.site} onChange={(e) => setNewMeter({ ...newMeter, site: e.target.value })} placeholder="Agriplus" /></div>
                <p className="text-xs text-muted-foreground">Se usa el mapa de registros estándar PM (V 3026, I 3010, P 3060, FP 3150, frec 3110). Editable luego en el archivo si el medidor usa otro mapa.</p>
              </div>
              <DialogFooter>
                <Button onClick={addMeter}><Save className="h-4 w-4" />Agregar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {openMeters && <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">On</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Nombre personalizado</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="text-center">Puerto</TableHead>
              <TableHead className="text-center">Unit</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meterRows().map((m, i) => (
              <TableRow key={m.name}>
                <TableCell><Switch checked={m.enabled} onCheckedChange={() => toggleMeter(i)} /></TableCell>
                {editMeterIdx === i && editMeter ? (
                  <>
                    <TableCell className="font-bold text-sm">{m.name}</TableCell>
                    <TableCell><Input value={editMeter.displayName} onChange={(e) => setEditMeter({ ...editMeter, displayName: e.target.value })} placeholder={m.name} /></TableCell>
                    <TableCell><Input value={editMeter.ip} onChange={(e) => setEditMeter({ ...editMeter, ip: e.target.value })} className="" /></TableCell>
                    <TableCell><Input type="number" value={editMeter.port} onChange={(e) => setEditMeter({ ...editMeter, port: +e.target.value })} className="w-20" /></TableCell>
                    <TableCell><Input type="number" value={editMeter.unitId} onChange={(e) => setEditMeter({ ...editMeter, unitId: +e.target.value })} className="w-16" /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" onClick={() => saveMeterEdit(i)}><Save className="h-3 w-3" />Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditMeterIdx(-1)}><X className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-bold text-sm">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.displayName || '-'}</TableCell>
                    <TableCell className="text-sm">{m.ip}</TableCell>
                    <TableCell className="text-center">{m.port}</TableCell>
                    <TableCell className="text-center">{m.unitId}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => { setEditMeterIdx(i); setEditMeter({ ...m }) }}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => delMeter(m.name)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>}
      </div>
    </div>
  )
}

// ─── Zones Tab ──────────────────────────────────────────────────
const METER_GAUGE_LABELS: Array<{ key: string; label: string; unit: string; hasRedLow?: boolean }> = [
  { key: 'voltage', label: 'Tensión',          unit: 'kV', hasRedLow: true },
  { key: 'current', label: 'Corriente',         unit: 'A'  },
  { key: 'power',   label: 'Potencia',          unit: 'kW' },
  { key: 'pf',      label: 'Factor de Potencia', unit: ''  },
]

function ZonesTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const [openSite, setOpenSite] = useState<Record<string, boolean>>({})
  const [openDrive, setOpenDrive] = useState<Record<string, boolean>>({})
  const [openMeter, setOpenMeter] = useState<Record<string, boolean>>({})

  // Build per-drive zones merged with defaults
  const drives = cfg.devices.map((dev) => {
    const def = JSON.parse(JSON.stringify(GAUGE_DEFAULTS[dev.type] ?? GAUGE_DEFAULTS.CFW900))
    const saved = cfg.gaugeZones?.[dev.name] ?? {}
    for (const k of Object.keys(saved)) if (def[k]) Object.assign(def[k], saved[k])
    return { name: dev.name, type: dev.type, site: dev.site || 'Sin Sitio', zones: def }
  })

  const sites = Array.from(new Set(drives.map((d) => d.site)))
  const meters = cfg.meters

  function updateZone(driveName: string, gaugeKey: string, field: string, val: number) {
    const gz = JSON.parse(JSON.stringify(cfg.gaugeZones ?? {}))
    if (!gz[driveName]) gz[driveName] = {}
    if (!gz[driveName][gaugeKey]) gz[driveName][gaugeKey] = {}
    gz[driveName][gaugeKey][field] = val
    store.setConfig({ ...cfg, gaugeZones: gz })
  }

  function resetDrive(name: string) {
    const gz = JSON.parse(JSON.stringify(cfg.gaugeZones ?? {}))
    delete gz[name]
    store.setConfig({ ...cfg, gaugeZones: gz })
  }

  // Setpoints resueltos por equipo (default por tipo + override por nombre)
  function resolvedSp(driveName: string, type: string): Record<string, number> {
    const as: any = cfg.alarmSetpoints ?? {}
    return { ...(as.defaults?.[type] ?? {}), ...(as.overrides?.[driveName] ?? {}) }
  }
  function updateSetpoint(driveName: string, field: string, val: number | null) {
    const as = JSON.parse(JSON.stringify(cfg.alarmSetpoints ?? { defaults: {}, overrides: {} }))
    if (!as.overrides) as.overrides = {}
    if (!as.overrides[driveName]) as.overrides[driveName] = {}
    if (val === null || Number.isNaN(val)) delete as.overrides[driveName][field]
    else as.overrides[driveName][field] = val
    store.setConfig({ ...cfg, alarmSetpoints: as })
  }

  function updateMeterZone(meterName: string, zoneKey: string, field: string, val: number) {
    const newMeters = cfg.meters.map(m => {
      if (m.name !== meterName) return m
      const zones = JSON.parse(JSON.stringify(m.ui?.zones ?? {}))
      if (!zones[zoneKey]) zones[zoneKey] = {}
      zones[zoneKey][field] = val
      return { ...m, ui: { ...(m.ui ?? {}), zones } }
    })
    store.setConfig({ ...cfg, meters: newMeters })
  }

  async function saveAll() {
    if (await store.save()) toast.success('Zonas guardadas')
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Zonas de Gauges</h2>
        <Button onClick={saveAll}><Save className="h-4 w-4" />Guardar Cambios</Button>
      </div>
      <p className="text-sm text-muted-foreground">Configure los rangos Verde/Amarillo/Rojo para cada gauge.</p>

      {/* ── Drives ── */}
      {sites.map((site) => (
        <div key={site} className="border rounded-md overflow-hidden">
          <button
            onClick={() => setOpenSite({ ...openSite, [site]: !openSite[site] })}
            className="w-full flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${openSite[site] ? 'rotate-90' : ''}`} />
            <strong>{site}</strong>
            <span className="text-xs opacity-80">({drives.filter((d) => d.site === site).length} drives)</span>
          </button>
          {openSite[site] && (
            <div className="p-3 space-y-2">
              {drives.filter((d) => d.site === site).map((zd) => (
                <div key={zd.name} className="border rounded-md overflow-hidden">
                  <button
                    onClick={() => setOpenDrive({ ...openDrive, [zd.name]: !openDrive[zd.name] })}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50"
                  >
                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${openDrive[zd.name] ? 'rotate-90' : ''}`} />
                    <strong className="text-primary">{zd.name}</strong>
                    <Badge variant="secondary" className="text-[10px]">{zd.type}</Badge>
                  </button>
                  {openDrive[zd.name] && (
                    <div className="p-3 space-y-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Gauge</th>
                            <th className="p-2">Min</th>
                            <th className="p-2">Max</th>
                            <th className="p-2 text-red-500">Rojo Bajo</th>
                            <th className="p-2 text-green-500">Verde hasta</th>
                            <th className="p-2 text-amber-500">Amarillo hasta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gaugeListFor(zd.type).map((g) => (
                            <tr key={g.key}>
                              <td className="p-2 font-bold">{g.label} <span className="text-muted-foreground text-[10px]">({g.unit})</span></td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].min ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'min', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].max ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'max', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                              <td className="p-1">
                                {g.key === 'tension'
                                  ? <Input type="number" value={zd.zones[g.key].redLow ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'redLow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-red-300" />
                                  : <span className="text-muted-foreground text-center block">-</span>}
                              </td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].green ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'green', +e.target.value)} className="h-8 text-center w-20 mx-auto border-green-300" /></td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].yellow ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'yellow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-amber-300" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="pt-3 mt-1 border-t">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Setpoints — alarmas y colores</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                          {[
                            { key: 'tempHigh', label: 'Temp. alta (°C)', step: '1' },
                            { key: 'currentHigh', label: 'Corriente alta (A)', step: '1' },
                            { key: 'cosPhiLow', label: 'Cos φ bajo', step: '0.01' },
                            { key: 'powerHigh', label: 'Potencia alta (kW)', step: '1' },
                            { key: 'frequencyHigh', label: 'Frec. alta (Hz)', step: '0.1' },
                            { key: 'commErrorMax', label: 'Máx. errores com.', step: '1' },
                          ].map((f) => (
                            <label key={f.key} className="text-xs flex flex-col gap-1">
                              <span className="text-muted-foreground">{f.label}</span>
                              <Input
                                type="number"
                                step={f.step}
                                value={resolvedSp(zd.name, zd.type)[f.key] ?? ''}
                                onChange={(e) => updateSetpoint(zd.name, f.key, e.target.value === '' ? null : +e.target.value)}
                                className="h-8"
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <Button size="sm" variant="outline" onClick={() => resetDrive(zd.name)}><RotateCcw className="h-3 w-3" />Restaurar defaults</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* ── Medidores ── */}
      {meters.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <button
            onClick={() => setOpenSite({ ...openSite, __meters__: !openSite.__meters__ })}
            className="w-full flex items-center gap-2 px-4 py-3 bg-violet-600 text-white font-bold text-sm"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${openSite.__meters__ ? 'rotate-90' : ''}`} />
            Medidores
            <span className="text-xs opacity-80">({meters.length})</span>
          </button>
          {openSite.__meters__ && <div className="p-3 space-y-2">
            {meters.map((m) => {
              const mz = (m.ui?.zones ?? {}) as Record<string, any>
              const title = (cfg as any).meterNames?.[m.name] || m.ui?.title || m.name
              return (
                <div key={m.name} className="border rounded-md overflow-hidden">
                  <button
                    onClick={() => setOpenMeter({ ...openMeter, [m.name]: !openMeter[m.name] })}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50"
                  >
                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${openMeter[m.name] ? 'rotate-90' : ''}`} />
                    <strong className="text-violet-600">{title}</strong>
                    <Badge variant="secondary" className="text-[10px]">{m.type}</Badge>
                  </button>
                  {openMeter[m.name] && (
                    <div className="p-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Gauge</th>
                            <th className="p-2">Min</th>
                            <th className="p-2">Max</th>
                            <th className="p-2 text-red-500">Rojo Bajo</th>
                            <th className="p-2 text-green-500">Verde hasta</th>
                            <th className="p-2 text-amber-500">Amarillo hasta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {METER_GAUGE_LABELS.map((g) => {
                            const z = mz[g.key] ?? {}
                            return (
                              <tr key={g.key}>
                                <td className="p-2 font-bold">{g.label} {g.unit && <span className="text-muted-foreground text-[10px]">({g.unit})</span>}</td>
                                <td className="p-1"><Input type="number" step="any" value={z.min ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'min', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                                <td className="p-1"><Input type="number" step="any" value={z.max ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'max', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                                <td className="p-1">
                                  {g.hasRedLow
                                    ? <Input type="number" step="any" value={z.redLow ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'redLow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-red-300" />
                                    : <span className="text-muted-foreground text-center block">-</span>}
                                </td>
                                <td className="p-1"><Input type="number" step="any" value={z.green ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'green', +e.target.value)} className="h-8 text-center w-20 mx-auto border-green-300" /></td>
                                <td className="p-1"><Input type="number" step="any" value={z.yellow ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'yellow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-amber-300" /></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>}
        </div>
      )}
    </Card>
  )
}

// ─── Usuarios ─────────────────────────────────────────────────────────
type UserRow = { role: 'admin' | 'operador'; user: string; hasPassword: boolean; pw: string }

function UsersTab() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      if (MODE === 'mock') {
        setRows([
          { role: 'admin', user: 'admin', hasPassword: true, pw: '' },
          { role: 'operador', user: 'operador', hasPassword: true, pw: '' },
        ])
      } else {
        const r = await authFetch(`${API_BASE}/settings/users`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        setRows((data.users || []).map((u: any) => ({ ...u, pw: '' })))
      }
    } catch (e: any) { toast.error(`No se pudieron cargar los usuarios: ${e.message}`) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function patch(role: string, p: Partial<UserRow>) {
    setRows(rs => rs.map(r => r.role === role ? { ...r, ...p } : r))
  }
  async function save(row: UserRow) {
    if (!row.user.trim()) { toast.error('El usuario no puede quedar vacío'); return }
    if (MODE === 'mock') { toast.success('Guardado (demo)'); patch(row.role, { pw: '', hasPassword: true }); return }
    setSavingRole(row.role)
    try {
      const body: any = { role: row.role, user: row.user.trim() }
      if (row.pw) body.password = row.pw
      const r = await authFetch(`${API_BASE}/settings/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      toast.success(`Usuario ${row.role} actualizado`)
      patch(row.role, { pw: '', hasPassword: row.hasPassword || !!row.pw })
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSavingRole(null) }
  }

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Cargando usuarios…</div>

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Dos roles: <strong>admin</strong> (todo, incl. Configuración) y <strong>operador</strong> (solo lectura).
        Dejá la contraseña vacía para no cambiarla.
      </p>
      {rows.map(row => (
        <Card key={row.role} className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={row.role === 'admin' ? 'default' : 'secondary'} className="uppercase">{row.role}</Badge>
            {row.hasPassword ? <span className="text-xs text-muted-foreground">contraseña configurada</span>
              : <span className="text-xs text-yellow-600 dark:text-yellow-400">sin contraseña</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Usuario</Label><Input value={row.user} onChange={e => patch(row.role, { user: e.target.value })} autoComplete="off" /></div>
            <div><Label>Nueva contraseña</Label><Input type="password" value={row.pw} onChange={e => patch(row.role, { pw: e.target.value })} placeholder="(sin cambios)" autoComplete="new-password" /></div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={savingRole === row.role} onClick={() => save(row)}>
              {savingRole === row.role ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Guardar
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ─── SMTP / Correo ────────────────────────────────────────────────────
type SmtpCfg = { host: string; port: number; user: string; from: string; to: string; secure: boolean; hasPassword: boolean; pass: string }

function SmtpTab() {
  const [cfg, setCfg] = useState<SmtpCfg | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      if (MODE === 'mock') {
        setCfg({ host: 'smtp.gmail.com', port: 587, user: 'planta@agriplus.com', from: 'planta@agriplus.com', to: 'mantenimiento@agriplus.com', secure: false, hasPassword: true, pass: '' })
      } else {
        const r = await authFetch(`${API_BASE}/settings/smtp`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json()
        setCfg({ ...d, pass: '' })
      }
    } catch (e: any) { toast.error(`No se pudo cargar el SMTP: ${e.message}`) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function patch(p: Partial<SmtpCfg>) { setCfg(c => c ? { ...c, ...p } : c) }

  async function save() {
    if (!cfg) return
    if (MODE === 'mock') { toast.success('Guardado (demo)'); patch({ pass: '', hasPassword: cfg.hasPassword || !!cfg.pass }); return }
    setSaving(true)
    try {
      const body: any = { host: cfg.host, port: cfg.port, user: cfg.user, from: cfg.from, to: cfg.to, secure: cfg.secure }
      if (cfg.pass) body.pass = cfg.pass
      const r = await authFetch(`${API_BASE}/settings/smtp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      toast.success('SMTP guardado')
      patch({ pass: '', hasPassword: cfg.hasPassword || !!cfg.pass })
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

  async function test() {
    if (MODE === 'mock') { toast.success('Correo de prueba enviado (demo)'); return }
    setTesting(true)
    try {
      const r = await authFetch(`${API_BASE}/settings/smtp/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      toast.success(`Correo de prueba enviado a ${d.to}`)
    } catch (e: any) { toast.error(`Falló el envío de prueba: ${e.message}`) }
    finally { setTesting(false) }
  }

  if (loading || !cfg) return <div className="text-muted-foreground text-sm py-8 text-center">Cargando configuración…</div>

  return (
    <div className="max-w-2xl">
      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">Servidor de correo saliente usado para alertas y el reporte diario.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2"><Label>Servidor (host)</Label><Input value={cfg.host} onChange={e => patch({ host: e.target.value })} placeholder="smtp.gmail.com" /></div>
          <div><Label>Puerto</Label><Input type="number" value={cfg.port} onChange={e => patch({ port: +e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Usuario</Label><Input value={cfg.user} onChange={e => patch({ user: e.target.value })} autoComplete="off" placeholder="usuario@dominio.com" /></div>
          <div><Label>Contraseña</Label><Input type="password" value={cfg.pass} onChange={e => patch({ pass: e.target.value })} placeholder={cfg.hasPassword ? '•••••• (sin cambios)' : 'contraseña'} autoComplete="new-password" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Remitente (From)</Label><Input value={cfg.from} onChange={e => patch({ from: e.target.value })} placeholder="planta@dominio.com" /></div>
          <div><Label>Destinatario(s)</Label><Input value={cfg.to} onChange={e => patch({ to: e.target.value })} placeholder="uno@dominio.com, otro@..." /></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={cfg.secure} onCheckedChange={v => patch({ secure: v })} />
          Conexión segura (SSL/TLS directo, puerto 465). Para 587 dejar apagado (STARTTLS).
        </label>
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="outline" disabled={testing} onClick={test}>
            {testing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
            Enviar prueba
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  )
}


