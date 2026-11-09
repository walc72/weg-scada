import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { authFetch } from '../../store/auth'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, Save, ChevronRight, ScanSearch, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DeviceConfig, DriveType, GatewayConfig, GatewaySlot, GatewayKind, GatewayScanCfg } from '../../types'
import { DEFAULT_GATEWAY_SCAN } from '../../types'
import { useLicense } from '../../store/license'
import { EnlaceSelect } from './CommsSection'
import { API_BASE } from './comun'

export default function GatewaysTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const fullB = useLicense(l => l.full('variadores'))
  const limitMsg = useLicense(l => l.limitMsg('variadores'))
  const [openGW, setOpenGW] = useState(true)
  const [showAddGw, setShowAddGw] = useState(false)
  const [newGw, setNewGw] = useState<{ name: string; kind: GatewayKind; ip: string; port: number; site: string }>({ name: '', kind: 'plc', ip: '', port: 502, site: '' })
  const [slotsGw, setSlotsGw] = useState<string | null>(null)  // gateway con panel de slots abierto
  const [gwScan, setGwScan] = useState<{ gw: string | null; loading: boolean; results: any[] }>({ gw: null, loading: false, results: [] })
  const [genCount, setGenCount] = useState(20)   // generador de mapa: cantidad de drives
  const [genAfter, setGenAfter] = useState(true)  // ubicar estados después de los datos
  const [adamMax, setAdamMax] = useState(16)      // ADAM: máx Unit IDs a escanear

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

  async function setGatewayEnlace(gwName: string, enlace?: string) {
    store.setConfig({ ...cfg, gateways: cfg.gateways.map(g => g.name === gwName ? { ...g, enlace } : g) })
    if (await store.save()) toast.success('Enlace del gateway actualizado')
  }

  // Layout del scan del PLC (configurable por gateway). Actualiza en el store;
  // se persiste al guardar slots o con blur (onSave manual).
  function scanOf(gw: GatewayConfig): GatewayScanCfg { return { ...DEFAULT_GATEWAY_SCAN, ...(gw.scan || {}) } }
  function updateScan(gwName: string, patch: Partial<GatewayScanCfg>) {
    const gateways = cfg.gateways.map(g => g.name === gwName ? { ...g, scan: { ...DEFAULT_GATEWAY_SCAN, ...(g.scan || {}), ...patch } } : g)
    store.setConfig({ ...cfg, gateways })
  }
  async function saveScan() { if (await store.save()) toast.success('Layout del scan guardado') }

  // Genera el mapa de slots automáticamente para N drives, con offsets según el
  // layout. Si genAfter, ubica los estados después de toda la zona de datos
  // (statusBase = N × regsPerDrive) para que datos y estados no se solapen.
  async function generateSlots(gw: GatewayConfig) {
    const n = Math.max(1, Math.min(64, Math.floor(genCount) || 1))
    const sc = scanOf(gw)
    const statusBase = genAfter ? n * sc.regsPerDrive : sc.statusBase
    const existing = slotsOf(gw.name).length
    if (existing && !confirm(`Esto reemplaza los ${existing} slots actuales por ${n} generados. ¿Continuar?`)) return
    const slots: GatewaySlot[] = Array.from({ length: n }, (_, i) => ({
      id: i, regOffset: i * sc.regsPerDrive, statusOffset: statusBase + i * sc.statusStride, label: `SSW ${i + 1}`,
    }))
    const gateways = cfg.gateways.map(g => g.name === gw.name
      ? { ...g, scan: { ...sc, statusBase, maxSlots: n }, slots } : g)
    store.setConfig({ ...cfg, gateways })
    if (await store.save()) toast.success(`${n} slots generados — datos ×${sc.regsPerDrive}, estado desde ${statusBase}`)
  }

  // ── ADAM: barrido de Unit IDs + alta de los detectados ──────────────
  async function scanAdam(gw: GatewayConfig) {
    setGwScan({ gw: gw.name, loading: true, results: [] })
    try {
      const r = await authFetch(`${API_BASE}/config/scan-gateway`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: gw.ip, port: gw.port, kind: 'adam', maxUnits: adamMax, statusOffset: 679 }),
      })
      const data = await r.json()
      const found = (data.units || []).filter((u: any) => u.detected).length
      setGwScan({ gw: gw.name, loading: false, results: data.units || [] })
      toast.success(`Scan: ${found} drive${found !== 1 ? 's' : ''} en ${adamMax} Unit IDs`)
    } catch {
      toast.error('Error al escanear el gateway')
      setGwScan({ gw: gw.name, loading: false, results: [] })
    }
  }
  async function createDrivesAdam(gw: GatewayConfig) {
    const used = new Set(cfg.devices.filter(d => d.gateway === gw.name).map(d => d.unitId))
    const pend = gwScan.results.filter((u: any) => u.detected && !used.has(u.unitId))
    if (!pend.length) { toast.info('No hay bombas nuevas detectadas'); return }
    if (!confirm(`Crear ${pend.length} drives SSW900 (por Unit ID) en ${gw.name}?`)) return
    const names = new Set(cfg.devices.map(d => d.name))
    const toAdd: DeviceConfig[] = pend.map((u: any) => {
      let name = `SSW ${u.unitId}`
      if (names.has(name)) { let k = 2; while (names.has(`${name} (${k})`)) k++; name = `${name} (${k})` }
      names.add(name)
      return { name, type: 'SSW900' as DriveType, site: gw.site || 'Agrocaraya', ip: gw.ip, port: gw.port, unitId: u.unitId, enabled: true, gateway: gw.name, statusOffset: 679 }
    })
    store.setConfig({ ...cfg, devices: [...cfg.devices, ...toAdd] })
    if (await store.save()) { toast.success(`${toAdd.length} bombas creadas`); setGwScan({ gw: null, loading: false, results: [] }) }
  }

  // Slots del gateway que todavía no tienen un device asignado
  function missingDrives(gw: GatewayConfig): GatewaySlot[] {
    const used = new Set(cfg.devices.filter(d => d.gateway === gw.name).map(d => d.slot))
    return slotsOf(gw.name).filter(s => !used.has(s.id))
  }
  // Crea un device SSW900 por cada slot sin device (idempotente)
  async function createDrives(gw: GatewayConfig) {
    const pend = missingDrives(gw)
    if (!pend.length) { toast.info('Todos los slots ya tienen una bomba'); return }
    if (!confirm(`Crear ${pend.length} drives SSW900 (uno por slot) en ${gw.name}?`)) return
    const names = new Set(cfg.devices.map(d => d.name))
    const toAdd: DeviceConfig[] = pend.map(s => {
      let name = (s.label && s.label.trim()) || `SSW ${s.id + 1}`
      if (names.has(name)) { let k = 2; while (names.has(`${name} (${k})`)) k++; name = `${name} (${k})` }
      names.add(name)
      return { name, type: 'SSW900' as DriveType, site: gw.site || 'Agriplus', ip: gw.ip, port: gw.port, unitId: 1, enabled: true, gateway: gw.name, slot: s.id }
    })
    store.setConfig({ ...cfg, devices: [...cfg.devices, ...toAdd] })
    if (await store.save()) toast.success(`${toAdd.length} bombas creadas`)
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
        body: JSON.stringify({ ip: gw.ip, port: gw.port, unitId: 1, ...(gw.scan || DEFAULT_GATEWAY_SCAN) }),
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
                    <EnlaceSelect value={g.enlace} onChange={(v) => setGatewayEnlace(g.name, v)} className="h-7 w-44 rounded-md border border-input bg-background px-2 text-xs" />
                    {kind === 'plc' && (
                      <span className="text-xs text-muted-foreground">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {kind === 'plc' ? (
                        <Button size="sm" variant="outline" onClick={() => setSlotsGw(open ? null : g.name)}>
                          <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} /> Slots (mapa PLC)
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setSlotsGw(open ? null : g.name)}>
                          <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} /> Bombas (RS-485)
                        </Button>
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

                      {/* Layout del scan (adapta el barrido a cualquier mapa de PLC) */}
                      {(() => { const sc = scanOf(g); return (
                        <div className="rounded border bg-background px-3 py-2">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Layout del scan (mapa %MW del PLC)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <label className="text-[10px] text-muted-foreground">Regs/drive
                              <Input type="number" value={sc.regsPerDrive} onChange={e => updateScan(g.name, { regsPerDrive: +e.target.value })} onBlur={saveScan} className="h-7 mt-0.5" /></label>
                            <label className="text-[10px] text-muted-foreground">Estado base
                              <Input type="number" value={sc.statusBase} onChange={e => updateScan(g.name, { statusBase: +e.target.value })} onBlur={saveScan} className="h-7 mt-0.5" /></label>
                            <label className="text-[10px] text-muted-foreground">Estado stride
                              <Input type="number" value={sc.statusStride} onChange={e => updateScan(g.name, { statusStride: +e.target.value })} onBlur={saveScan} className="h-7 mt-0.5" /></label>
                            <label className="text-[10px] text-muted-foreground">Máx slots
                              <Input type="number" value={sc.maxSlots} onChange={e => updateScan(g.name, { maxSlots: +e.target.value })} onBlur={saveScan} className="h-7 mt-0.5" /></label>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5">El scan lee datos en <code>slot×{sc.regsPerDrive}</code> y estado en <code>{sc.statusBase}+slot×{sc.statusStride}</code>. Defaults: 70/140/12/6.</p>
                        </div>
                      ) })()}

                      {/* Generador automático del mapa de slots */}
                      <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2">
                        <p className="text-[11px] font-semibold text-primary mb-1.5">Generar mapa automático</p>
                        <div className="flex items-end gap-3 flex-wrap">
                          <label className="text-[10px] text-muted-foreground">Cantidad de bombas
                            <Input type="number" min={1} max={64} value={genCount} onChange={e => setGenCount(+e.target.value)} className="h-7 mt-0.5 w-24" /></label>
                          <label className="flex items-center gap-2 text-[11px] cursor-pointer pb-1">
                            <Switch checked={genAfter} onCheckedChange={setGenAfter} />
                            Estado después de los datos (evita solapamiento)
                          </label>
                          <div className="ml-auto flex gap-2">
                            <Button size="sm" onClick={() => generateSlots(g)}>
                              <ScanSearch className="h-3 w-3 mr-1" />Generar {Math.max(1, Math.min(64, Math.floor(genCount) || 1))} slots
                            </Button>
                            <Button size="sm" variant="outline" disabled={fullB || missingDrives(g).length === 0} title={fullB ? limitMsg : undefined} onClick={() => createDrives(g)}>
                              <Plus className="h-3 w-3 mr-1" />Crear {missingDrives(g).length} drives
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          Crea los slots con <code>regOffset = slot×{scanOf(g).regsPerDrive}</code>{genAfter ? <> y <code>statusBase = {Math.max(1, Math.min(64, Math.floor(genCount) || 1)) * scanOf(g).regsPerDrive}</code></> : null} y <code>statusOffset = base + slot×{scanOf(g).statusStride}</code>. Etiqueta <code>SSW 1…N</code>.
                        </p>
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

                  {kind === 'adam' && open && (
                    <div className="mt-3 rounded-md border p-3 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bombas por Unit ID (RS-485)</p>
                        <div className="flex items-end gap-2">
                          <label className="text-[10px] text-muted-foreground">Máx Unit IDs
                            <Input type="number" min={1} max={247} value={adamMax} onChange={e => setAdamMax(+e.target.value)} className="h-7 mt-0.5 w-20" /></label>
                          <Button size="sm" variant="outline" disabled={gwScan.loading && gwScan.gw === g.name} onClick={() => scanAdam(g)}>
                            {gwScan.loading && gwScan.gw === g.name ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ScanSearch className="h-3 w-3 mr-1" />}
                            Escanear
                          </Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Barre los Unit IDs 1…{adamMax} leyendo el mapa nativo del SSW (datos en 0, estado en 679). Puede tardar si hay Unit IDs sin responder.</p>

                      {gwScan.gw === g.name && gwScan.results.length > 0 && (() => {
                        const found = gwScan.results.filter((u: any) => u.detected)
                        const used = new Set(cfg.devices.filter(d => d.gateway === g.name).map(d => d.unitId))
                        const nuevos = found.filter((u: any) => !used.has(u.unitId)).length
                        return (
                          <div className="rounded border bg-background">
                            <div className="flex items-center justify-between px-3 py-2 border-b">
                              <span className="text-xs font-semibold">{found.length} drive{found.length !== 1 ? 's' : ''} detectado{found.length !== 1 ? 's' : ''}</span>
                              <Button size="sm" disabled={fullB || nuevos === 0} title={fullB ? limitMsg : undefined} onClick={() => createDrivesAdam(g)}><Plus className="h-3 w-3 mr-1" />Crear {nuevos} bombas</Button>
                            </div>
                            {found.length === 0
                              ? <p className="text-xs text-muted-foreground px-3 py-2">No se detectaron bombas en ese rango de Unit IDs.</p>
                              : (
                                <table className="w-full text-xs">
                                  <thead><tr className="text-muted-foreground border-b">
                                    <th className="text-left px-2 py-1">Unit ID</th><th className="text-left px-2 py-1">Estado</th>
                                    <th className="text-right px-2 py-1">Tensión</th><th className="text-right px-2 py-1">Corriente</th><th className="text-right px-2 py-1">Horas</th><th className="px-2 py-1"></th>
                                  </tr></thead>
                                  <tbody>
                                    {found.map((u: any) => (
                                      <tr key={u.unitId} className="border-b border-border/40">
                                        <td className="px-2 py-1 font-medium">{u.unitId}</td>
                                        <td className="px-2 py-1"><span className="inline-flex items-center gap-1 text-foreground"><span className="w-1.5 h-1.5 bg-foreground inline-block" />{u.statusText || 'OK'}</span></td>
                                        <td className="px-2 py-1 text-right">{u.voltage ?? '-'} V</td>
                                        <td className="px-2 py-1 text-right">{u.current ?? '-'} A</td>
                                        <td className="px-2 py-1 text-right">{u.hoursPowered ?? '-'} h</td>
                                        <td className="px-2 py-1 text-right">{used.has(u.unitId) ? <span className="text-muted-foreground text-[10px]">ya cargado</span> : null}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )
                            }
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
