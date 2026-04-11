import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/config'
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
import { Lock, Plus, Trash2, Pencil, Save, X, ChevronRight, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { DeviceConfig, DriveType } from '../types'
import { GAUGE_DEFAULTS } from '../lib/gaugeDefaults'

const PASSWORD = import.meta.env.VITE_CONFIG_PASSWORD as string || 'Agriplus00..'


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
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)

  useEffect(() => { if (!store.config) store.load() }, [])

  function checkPw() {
    if (pw === PASSWORD) {
      setAuthed(true)
      setPwError(false)
    } else {
      setPwError(true)
    }
  }

  if (!authed) {
    return (
      <div className="flex justify-center pt-16">
        <Card className="w-[380px] p-8 text-center">
          <Lock className="h-12 w-12 mx-auto text-primary mb-3" />
          <h2 className="text-xl font-bold">Acceso Restringido</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Ingrese la contraseña para acceder</p>
          <Input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Contraseña"
            onKeyDown={(e) => e.key === 'Enter' && checkPw()}
            autoFocus
            className={pwError ? 'border-destructive' : ''}
          />
          {pwError && <div className="text-destructive text-xs mt-2">Contraseña incorrecta</div>}
          <Button className="w-full mt-4" onClick={checkPw}>Ingresar</Button>
        </Card>
      </div>
    )
  }

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
      </TabsList>

      <TabsContent value="devices"><DevicesTab /></TabsContent>
      <TabsContent value="zones"><ZonesTab /></TabsContent>
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
  const [newDev, setNewDev] = useState<DeviceConfig>({
    name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1, enabled: true
  })
  const [useGateway, setUseGateway] = useState(false)

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

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-hidden">
        <button onClick={() => setOpenGW(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 font-semibold text-sm">
          <ChevronRight className={`h-4 w-4 transition-transform ${openGW ? 'rotate-90' : ''}`} />
          Gateways <span className="text-xs text-muted-foreground">({cfg.gateways.length})</span>
        </button>
        {openGW && <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead><TableHead>IP</TableHead>
              <TableHead className="text-center">Puerto</TableHead><TableHead>Sitio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cfg.gateways.map((g) => (
              <TableRow key={g.name}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="font-mono text-sm">{g.ip}</TableCell>
                <TableCell className="text-center">{g.port}</TableCell>
                <TableCell>{g.site}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>}
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
            <DialogContent>
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
                    <Label className="text-blue-700 dark:text-blue-400 font-semibold">Gateway PLC</Label>
                    <Select
                      value={`${newDev.ip}:${newDev.port}`}
                      onValueChange={(v) => {
                        const gw = cfg.gateways.find(g => `${g.ip}:${g.port}` === v)
                        if (gw) setNewDev({ ...newDev, ip: gw.ip, port: gw.port, site: gw.site || newDev.site })
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Seleccionar gateway..." /></SelectTrigger>
                      <SelectContent>
                        {cfg.gateways.map(g => (
                          <SelectItem key={g.name} value={`${g.ip}:${g.port}`}>
                            {g.name} — {g.ip}:{g.port}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Cada SSW900 comparte la IP del PLC. Diferenciá drives con Reg Offset y Status Offset.
                    </p>
                  </div>
                )}

                <div>
                  <Label>Sitio</Label>
                  <Select value={newDev.site} onValueChange={(v) => setNewDev({ ...newDev, site: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(cfg.gateways.map(g => g.site).filter(Boolean))).map(s => (
                        <SelectItem key={s} value={s!}>{s}</SelectItem>
                      ))}
                      <SelectItem value="Agriplus">Agriplus</SelectItem>
                      <SelectItem value="Agrocaraya">Agrocaraya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!useGateway && (
                  <div><Label>IP</Label><Input value={newDev.ip} onChange={(e) => setNewDev({ ...newDev, ip: e.target.value })} placeholder="192.168.10.x" className="font-mono" /></div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {useGateway
                    ? <div><Label>IP Gateway</Label><Input value={newDev.ip} readOnly className="font-mono bg-muted" /></div>
                    : null
                  }
                  <div><Label>Puerto</Label><Input type="number" value={newDev.port} onChange={(e) => setNewDev({ ...newDev, port: +e.target.value })} /></div>
                  <div><Label>Unit ID</Label><Input type="number" value={newDev.unitId} onChange={(e) => setNewDev({ ...newDev, unitId: +e.target.value })} /></div>
                </div>

                {/* Offsets solo para SSW900 via gateway */}
                {useGateway && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Reg Offset</Label>
                      <Input type="number" value={(newDev as any).regOffset ?? 0}
                        onChange={(e) => setNewDev({ ...newDev, regOffset: +e.target.value } as any)}
                        placeholder="0, 70, 140..." />
                      <p className="text-xs text-muted-foreground mt-1">Offset de registros de datos (0 = primer drive)</p>
                    </div>
                    <div>
                      <Label>Status Offset</Label>
                      <Input type="number" value={(newDev as any).statusOffset ?? 0}
                        onChange={(e) => setNewDev({ ...newDev, statusOffset: +e.target.value } as any)}
                        placeholder="140, 152..." />
                      <p className="text-xs text-muted-foreground mt-1">Offset de registros de estado</p>
                    </div>
                  </div>
                )}
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
                    <TableCell><Input value={editDev.ip} onChange={(e) => setEditDev({ ...editDev, ip: e.target.value })} className="font-mono" /></TableCell>
                    <TableCell><Input type="number" value={editDev.port} onChange={(e) => setEditDev({ ...editDev, port: +e.target.value })} className="w-20" /></TableCell>
                    <TableCell><Input type="number" value={editDev.unitId} onChange={(e) => setEditDev({ ...editDev, unitId: +e.target.value })} className="w-16" /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" onClick={() => saveEdit(i)}><Save className="h-3 w-3" />Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditIdx(-1)}><X className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-bold">{d.name}</TableCell>
                    <TableCell className="text-center"><Badge variant={'secondary'}>{d.type}</Badge></TableCell>
                    <TableCell>{d.site}</TableCell>
                    <TableCell className="font-mono text-sm">{d.ip}</TableCell>
                    <TableCell className="text-center">{d.port}</TableCell>
                    <TableCell className="text-center">{d.unitId}</TableCell>
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
        <button onClick={() => setOpenMeters(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 font-semibold text-sm">
          <ChevronRight className={`h-4 w-4 transition-transform ${openMeters ? 'rotate-90' : ''}`} />
          Medidores <span className="text-xs text-muted-foreground">({cfg.meters.length})</span>
        </button>
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
                    <TableCell><Input value={editMeter.ip} onChange={(e) => setEditMeter({ ...editMeter, ip: e.target.value })} className="font-mono" /></TableCell>
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
                    <TableCell className="font-mono text-sm">{m.ip}</TableCell>
                    <TableCell className="text-center">{m.port}</TableCell>
                    <TableCell className="text-center">{m.unitId}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditMeterIdx(i); setEditMeter({ ...m }) }}><Pencil className="h-3 w-3" /></Button>
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
                              <td className="p-1"><Input type="number" defaultValue={zd.zones[g.key].min} onChange={(e) => updateZone(zd.name, g.key, 'min', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                              <td className="p-1"><Input type="number" defaultValue={zd.zones[g.key].max} onChange={(e) => updateZone(zd.name, g.key, 'max', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                              <td className="p-1">
                                {g.key === 'tension'
                                  ? <Input type="number" defaultValue={zd.zones[g.key].redLow} onChange={(e) => updateZone(zd.name, g.key, 'redLow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-red-300" />
                                  : <span className="text-muted-foreground text-center block">-</span>}
                              </td>
                              <td className="p-1"><Input type="number" defaultValue={zd.zones[g.key].green} onChange={(e) => updateZone(zd.name, g.key, 'green', +e.target.value)} className="h-8 text-center w-20 mx-auto border-green-300" /></td>
                              <td className="p-1"><Input type="number" defaultValue={zd.zones[g.key].yellow} onChange={(e) => updateZone(zd.name, g.key, 'yellow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-amber-300" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                                <td className="p-1"><Input type="number" step="any" defaultValue={z.min} onChange={(e) => updateMeterZone(m.name, g.key, 'min', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                                <td className="p-1"><Input type="number" step="any" defaultValue={z.max} onChange={(e) => updateMeterZone(m.name, g.key, 'max', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                                <td className="p-1">
                                  {g.hasRedLow
                                    ? <Input type="number" step="any" defaultValue={z.redLow} onChange={(e) => updateMeterZone(m.name, g.key, 'redLow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-red-300" />
                                    : <span className="text-muted-foreground text-center block">-</span>}
                                </td>
                                <td className="p-1"><Input type="number" step="any" defaultValue={z.green} onChange={(e) => updateMeterZone(m.name, g.key, 'green', +e.target.value)} className="h-8 text-center w-20 mx-auto border-green-300" /></td>
                                <td className="p-1"><Input type="number" step="any" defaultValue={z.yellow} onChange={(e) => updateMeterZone(m.name, g.key, 'yellow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-amber-300" /></td>
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


