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

const PASSWORD = 'Agriplus00..'

const Z_DEFAULTS: Record<DriveType, Record<string, any>> = {
  CFW900: {
    velocidad:  { min: 0, max: 1800, green: 1200, yellow: 1500 },
    corriente:  { min: 0, max: 150,  green: 80,   yellow: 120 },
    tension:    { min: 0, max: 500,  redLow: 350, green: 380, yellow: 480 },
    frecuencia: { min: 0, max: 70,   green: 50,   yellow: 62 }
  },
  SSW900: {
    corriente: { min: 0, max: 800, green: 500, yellow: 700 },
    tension:   { min: 0, max: 500, redLow: 350, green: 380, yellow: 480 }
  }
}

const PM_LABELS: Record<string, string> = {
  voltage: 'Tensión (kV)',
  current: 'Corriente (A)',
  power: 'Potencia (kW)',
  pf: 'Factor de Potencia'
}

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

  if (!store.config) {
    return <div className="text-center text-muted-foreground py-16">Cargando configuración...</div>
  }

  return (
    <Tabs defaultValue="devices" className="space-y-4">
      <TabsList>
        <TabsTrigger value="devices">Dispositivos</TabsTrigger>
        <TabsTrigger value="zones">Zonas de Gauges</TabsTrigger>
        <TabsTrigger value="pm8000">PM8000</TabsTrigger>
        <TabsTrigger value="medidores">Medidores</TabsTrigger>
      </TabsList>

      <TabsContent value="devices"><DevicesTab /></TabsContent>
      <TabsContent value="zones"><ZonesTab /></TabsContent>
      <TabsContent value="pm8000"><Pm8000Tab /></TabsContent>
      <TabsContent value="medidores"><MetersTab /></TabsContent>
    </Tabs>
  )
}

// ─── Devices Tab ────────────────────────────────────────────────
function DevicesTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const [editIdx, setEditIdx] = useState(-1)
  const [editDev, setEditDev] = useState<DeviceConfig | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newDev, setNewDev] = useState<DeviceConfig>({
    name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1, enabled: true
  })

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

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Gateways</h2>
        </div>
        <Table>
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
        </Table>
      </Card>

      <Card>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Dispositivos ({cfg.devices.length})</h2>
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
                  <Select value={newDev.type} onValueChange={(v) => setNewDev({ ...newDev, type: v as DriveType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CFW900">CFW900</SelectItem>
                      <SelectItem value="SSW900">SSW900</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sitio</Label>
                  <Select value={newDev.site} onValueChange={(v) => setNewDev({ ...newDev, site: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Agriplus">Agriplus</SelectItem>
                      <SelectItem value="Agrocaraya">Agrocaraya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>IP</Label><Input value={newDev.ip} onChange={(e) => setNewDev({ ...newDev, ip: e.target.value })} placeholder="192.168.10.x" className="font-mono" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Puerto</Label><Input type="number" value={newDev.port} onChange={(e) => setNewDev({ ...newDev, port: +e.target.value })} /></div>
                  <div><Label>Unit ID</Label><Input type="number" value={newDev.unitId} onChange={(e) => setNewDev({ ...newDev, unitId: +e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
                <Button onClick={addDevice}>Agregar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Table>
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
                    <TableCell className="text-center"><Badge variant={d.type === 'CFW900' ? 'info' : 'purple'}>{d.type}</Badge></TableCell>
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
        </Table>
      </Card>
    </div>
  )
}

// ─── Zones Tab ──────────────────────────────────────────────────
function ZonesTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const [openSite, setOpenSite] = useState<Record<string, boolean>>({})
  const [openDrive, setOpenDrive] = useState<Record<string, boolean>>({})

  // Build per-drive zones merged with defaults
  const drives = cfg.devices.map((dev) => {
    const def = JSON.parse(JSON.stringify(Z_DEFAULTS[dev.type] || Z_DEFAULTS.CFW900))
    const saved = (cfg.gaugeZones && cfg.gaugeZones[dev.name]) || {}
    for (const k of Object.keys(saved)) if (def[k]) Object.assign(def[k], saved[k])
    return { name: dev.name, type: dev.type, site: dev.site || 'Sin Sitio', zones: def }
  })

  const sites = Array.from(new Set(drives.map((d) => d.site)))

  function updateZone(driveName: string, gaugeKey: string, field: string, val: number) {
    if (!cfg.gaugeZones) cfg.gaugeZones = {}
    if (!cfg.gaugeZones[driveName]) cfg.gaugeZones[driveName] = {}
    if (!cfg.gaugeZones[driveName][gaugeKey]) cfg.gaugeZones[driveName][gaugeKey] = {} as any
    ;(cfg.gaugeZones[driveName][gaugeKey] as any)[field] = val
    store.setConfig({ ...cfg })
  }

  function resetDrive(name: string) {
    if (cfg.gaugeZones && cfg.gaugeZones[name]) {
      delete cfg.gaugeZones[name]
      store.setConfig({ ...cfg })
    }
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
                    <Badge variant={zd.type === 'CFW900' ? 'info' : 'purple'} className="text-[10px]">{zd.type}</Badge>
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
                                  : <span className="text-muted-foreground">-</span>}
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
    </Card>
  )
}

// ─── Meters Tab ─────────────────────────────────────────────────
function MetersTab() {
  const store = useConfigStore()
  const cfg   = store.config!

  type MeterEntry = typeof cfg.meters[number] & { displayName?: string }

  const [entries, setEntries] = useState<MeterEntry[]>(() =>
    cfg.meters.map(m => ({ ...m, displayName: (cfg.meterNames ?? {})[m.name] ?? '' }))
  )

  function update(i: number, field: string, val: string | number | boolean) {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }

  async function save() {
    const newMeters = entries.map(({ displayName: _, ...rest }) => rest)
    const newNames: Record<string, string> = {}
    for (const e of entries) {
      if (e.displayName) newNames[e.name] = e.displayName
    }
    store.setConfig({ ...cfg, meters: newMeters, meterNames: newNames })
    if (await store.save()) toast.success('Medidores guardados')
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Medidores</h2>
        <Button onClick={save}><Save className="h-4 w-4" />Guardar</Button>
      </div>

      <div className="space-y-3">
        {entries.map((m, i) => (
          <Card key={m.name} className="p-4 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold font-mono">{m.name}</span>
              <div className="flex items-center gap-2 text-sm">
                <Label className="text-xs">Habilitado</Label>
                <Switch
                  checked={(m as any).enabled !== false}
                  onCheckedChange={v => update(i, 'enabled', v)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Nombre personalizado</Label>
                <Input
                  value={m.displayName ?? ''}
                  onChange={e => update(i, 'displayName', e.target.value)}
                  placeholder={m.name}
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">IP</Label>
                <Input
                  value={m.ip}
                  onChange={e => update(i, 'ip', e.target.value)}
                  className="mt-1 font-mono"
                  placeholder="192.168.10.xx"
                />
              </div>
              <div>
                <Label className="text-xs">Puerto</Label>
                <Input
                  type="number"
                  value={m.port}
                  onChange={e => update(i, 'port', +e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Unit ID</Label>
                <Input
                  type="number"
                  value={m.unitId}
                  onChange={e => update(i, 'unitId', +e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  )
}

// ─── PM8000 Tab ─────────────────────────────────────────────────
function Pm8000Tab() {
  const store = useConfigStore()
  const cfg = store.config!
  const meter = cfg.meters[0]

  if (!meter || !meter.ui) {
    return <Card className="p-6 text-center text-muted-foreground">No hay medidor configurado.</Card>
  }

  function update(field: 'title' | string, val: any, zone?: string) {
    if (field === 'title') meter.ui!.title = val
    else if (zone) (meter.ui!.zones as any)[zone][field] = val
    store.setConfig({ ...cfg })
  }

  async function save() {
    if (await store.save()) toast.success('PM8000 guardado')
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Configuración PM8000</h2>
        <Button onClick={save}><Save className="h-4 w-4" />Guardar</Button>
      </div>

      <div>
        <Label>Título del medidor</Label>
        <Input value={meter.ui.title} onChange={(e) => update('title', e.target.value)} />
      </div>

      {Object.entries(meter.ui.zones).map(([k, z]) => (
        <Card key={k} className="p-4 bg-muted/20">
          <div className="font-semibold text-primary mb-3">{PM_LABELS[k]}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Min</Label><Input type="number" step="any" defaultValue={z.min} onChange={(e) => update('min', +e.target.value, k)} /></div>
            <div><Label className="text-xs">Max</Label><Input type="number" step="any" defaultValue={z.max} onChange={(e) => update('max', +e.target.value, k)} /></div>
            <div><Label className="text-xs">Verde hasta</Label><Input type="number" step="any" defaultValue={z.green} onChange={(e) => update('green', +e.target.value, k)} /></div>
            <div><Label className="text-xs">Amarillo hasta</Label><Input type="number" step="any" defaultValue={z.yellow} onChange={(e) => update('yellow', +e.target.value, k)} /></div>
          </div>
        </Card>
      ))}
    </Card>
  )
}
