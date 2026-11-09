import { useState, useEffect, type JSX } from 'react'
import { useConfigStore } from '../store/config'
import { authFetch, useAuthStore } from '../store/auth'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { SkeletonTabla } from '../components/ui/skeleton'
import { byName } from '../store/drives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import { Plus, Trash2, Pencil, Save, X, ChevronRight, ScanSearch, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DeviceConfig, DriveType, AppConfig, GatewayConfig, GatewaySlot, GatewayKind, GatewayScanCfg } from '../types'
import { DEFAULT_GATEWAY_SCAN } from '../types'
import BrandingTab from './config/BrandingTab'
import ConexionTab from './config/ConexionTab'
import ReplicasTab from './config/ReplicasTab'
import LicenciaTab from './config/LicenciaTab'
import ZonasTab from './config/ZonasTab'
import AlarmasTab from './config/AlarmasTab'
import BalanceTab from './config/BalanceTab'
import UsuariosTab from './config/UsuariosTab'
import CorreoTab from './config/CorreoTab'
import BackupsTab from './config/BackupsTab'
import { useSearchParams } from 'react-router'
import { useLicense } from '../store/license'
import { useServerStore } from '../store/server'
import { FlowmetersSection, PumpCaudalCell } from './config/FlowmetersSection'
import { PumpNominalCell } from './config/PumpNominalCell'
import { CampoSection, FueraServicioBtn } from './config/CampoSection'
import { CommsSection, EnlaceSelect } from './config/CommsSection'
import { API_BASE } from './config/comun'

export default function Config() {
  const store = useConfigStore()
  const replica = useServerStore(s => s.replica)
  // Marca, Conexión y Réplicas: solo el superadmin
  const superadmin = useAuthStore(s => s.role === 'superadmin')
  // Backups: admin/superadmin (la ruta ya es solo-admin), con módulo, fuera de réplica
  const backups = useLicense(l => l.hasModule('backup')) && !replica
  const caudales = useLicense(l => l.hasModule('caudales'))
  const unifilar = useLicense(l => l.hasModule('unifilar'))
  const generadores = useLicense(l => l.hasModule('generadores'))
  const comms = useLicense(l => l.hasModule('comunicaciones'))
  // ?tab=… permite enlazar a una pestaña (p. ej. el aviso de backup de la App)
  const [params, setParams] = useSearchParams()

  useEffect(() => { if (!store.config) store.load() }, [])

  // Sin gate de contraseña propio: la ruta /config ya es solo-admin (por rol).

  if (store.error) {
    return <div className="text-center text-destructive py-16">Error al cargar configuración: {store.error}</div>
  }

  if (!store.config) {
    return <SkeletonTabla filas={8} />
  }

  // Grupos con subpestañas; ?tab= sigue siendo la subpestaña (los enlaces viejos, como ?tab=backups, siguen andando)
  const equipo = (solo: string) => <fieldset disabled={replica} className="min-w-0"><DevicesTab solo={solo} /></fieldset>
  const soloLectura = (el: JSX.Element) => <fieldset disabled={replica} className="min-w-0">{el}</fieldset>
  const GRUPOS: { id: string; label: string; subs: { id: string; label: string; el: JSX.Element }[] }[] = [
    { id: 'equipos', label: 'Equipos', subs: [
      { id: 'devices', label: 'Bombas', el: equipo('devices') },
      { id: 'meters', label: 'Medidores', el: equipo('meters') },
      { id: 'gateways', label: 'Gateways', el: equipo('gateways') },
      ...(caudales ? [{ id: 'flow', label: 'Caudalímetros', el: equipo('flow') }] : []),
      ...(unifilar ? [{ id: 'campo', label: 'Reconectadores y reguladores', el: equipo('campo') }] : []),
      ...(generadores ? [{ id: 'generadores', label: 'Generadores', el: equipo('generadores') }] : []),
      ...(comms ? [{ id: 'comms', label: 'Enlaces', el: equipo('comms') }] : []),
    ] },
    { id: 'supervision', label: 'Supervisión', subs: [
      { id: 'zones', label: 'Zonas de gauges', el: soloLectura(<ZonasTab />) },
      { id: 'alarms', label: 'Alarmas', el: soloLectura(<AlarmasTab />) },
      { id: 'balance', label: 'Balance', el: soloLectura(<BalanceTab />) },
    ] },
    { id: 'acceso', label: 'Usuarios y correo', subs: [
      { id: 'users', label: 'Usuarios', el: <UsuariosTab /> },
      { id: 'smtp', label: 'Correo', el: <CorreoTab /> },
    ] },
    { id: 'sistema', label: 'Sistema', subs: [
      { id: 'licencia', label: 'Licencia', el: <LicenciaTab /> },
      ...(backups ? [{ id: 'backups', label: 'Backups', el: <BackupsTab /> }] : []),
      ...(superadmin ? [{ id: 'brand', label: 'Marca', el: <BrandingTab /> }, { id: 'conexion', label: 'Conexión', el: <ConexionTab /> }] : []),
      ...(superadmin && !replica ? [{ id: 'replicas', label: 'Réplicas', el: <ReplicasTab /> }] : []),
    ] },
  ]
  const tab = params.get('tab') || 'devices'
  const grupo = GRUPOS.find(g => g.subs.some(s => s.id === tab)) || GRUPOS[0]
  const sub = grupo.subs.find(s => s.id === tab) || grupo.subs[0]
  const ir = (t: string) => setParams({ tab: t }, { replace: true })

  return (
    <Tabs value={grupo.id} onValueChange={g => ir(GRUPOS.find(x => x.id === g)!.subs[0].id)} className="space-y-4">
      <TabsList>
        {GRUPOS.map(g => <TabsTrigger key={g.id} value={g.id}>{g.label}</TabsTrigger>)}
      </TabsList>

      {replica && (
        <div className="border bg-muted/40 px-3 py-2 text-sm">
          Servidor réplica: equipos, zonas y balance se sincronizan desde planta y son solo lectura.
          Usuarios, correo y marca son de este servidor.
        </div>
      )}
      {/* fieldset disabled deshabilita inputs/botones (incl. Switch/Select de Radix, que son <button>) */}
      {GRUPOS.map(g => (
        <TabsContent key={g.id} value={g.id} className="mt-0">
          <Tabs value={sub.id} onValueChange={ir}>
            <TabsList aria-label={`Secciones de ${g.label}`} className="border-t-0 bg-muted/30">
              {g.subs.map(s => (
                <TabsTrigger key={s.id} value={s.id} className="min-h-[36px] px-3 text-[11px] tracking-wider normal-case data-[state=active]:bg-card">{s.label}</TabsTrigger>
              ))}
            </TabsList>
            {g.subs.map(s => <TabsContent key={s.id} value={s.id}>{s.el}</TabsContent>)}
          </Tabs>
        </TabsContent>
      ))}
    </Tabs>
  )
}

// ─── Devices Tab ────────────────────────────────────────────────
type MeterRow = { name: string; displayName: string; ip: string; port: number; unitId: number; enabled: boolean; enlace?: string }

// Una subpestaña de Equipos por vez (las secciones comparten estado y diálogos)
function DevicesTab({ solo }: { solo: string }) {
  const store = useConfigStore()
  const cfg = store.config!
  const fullB = useLicense(l => l.full('variadores'))
  const fullMed = useLicense(l => l.full('medidores'))
  const limitMsgMed = useLicense(l => l.limitMsg('medidores'))
  const hasMedidores = useLicense(l => l.hasModule('medidores'))
  const hasCaudales = useLicense(l => l.hasModule('caudales'))
  const limitMsg = useLicense(l => l.limitMsg('variadores'))
  const [editIdx, setEditIdx] = useState(-1)
  const [editDev, setEditDev] = useState<DeviceConfig | null>(null)
  const [editMeterIdx, setEditMeterIdx] = useState(-1)
  const [editMeter, setEditMeter] = useState<MeterRow | null>(null)
  const [openGW, setOpenGW] = useState(true)
  const [openDev, setOpenDev] = useState(true)
  const [openMeters, setOpenMeters] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddMeter, setShowAddMeter] = useState(false)
  const [newMeter, setNewMeter] = useState<{ name: string; type: 'PM8000' | 'PM7400'; ip: string; port: number; unitId: number; site: string; enlace?: string }>({
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
  const [genCount, setGenCount] = useState(20)   // generador de mapa: cantidad de drives
  const [genAfter, setGenAfter] = useState(true)  // ubicar estados después de los datos
  const [adamMax, setAdamMax] = useState(16)      // ADAM: máx Unit IDs a escanear

  async function addDevice() {
    if (!newDev.name.trim()) { toast.error('Nombre obligatorio'); return }
    if (cfg.devices.find((d) => d.name === newDev.name.trim())) {
      toast.error('Ya existe un dispositivo con ese nombre'); return
    }
    cfg.devices.push({ ...newDev, name: newDev.name.trim(), ...(newDev.gateway ? { enlace: undefined } : {}) })
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

  async function toggleFueraServicio(d: DeviceConfig) {
    d.fueraServicio = !d.fueraServicio || undefined
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
  // Equipo activo que ya usa ese slot (el backend rechaza repetirlo)
  function slotOwner(gwName: string | undefined, slotId: number, exceptIdx = -1): string | undefined {
    return cfg.devices.find((d, i) => i !== exceptIdx && d.enabled !== false && d.gateway === gwName && d.slot === slotId)?.name
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

  function meterRows(): MeterRow[] {
    return cfg.meters.map(m => ({
      name: m.name,
      displayName: (cfg as any).meterNames?.[m.name] ?? '',
      ip: m.ip,
      port: m.port,
      unitId: m.unitId,
      enabled: (m as any).enabled !== false,
      enlace: m.enlace,
    }))
  }

  async function saveMeterEdit(i: number) {
    if (!editMeter) return
    const newMeters = cfg.meters.map((m, idx) => idx === i ? { ...m, ip: editMeter.ip, port: editMeter.port, unitId: editMeter.unitId, enabled: editMeter.enabled, enlace: editMeter.enlace } : m)
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
      // Mapa de registros estándar PM (1-based): V/I/P/FP/reactiva/frecuencia
      regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150, reactive: 3068, freq: 3110 },
    }
    if (newMeter.site.trim()) meter.site = newMeter.site.trim()
    if (newMeter.enlace) meter.enlace = newMeter.enlace
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
      <div className={`border rounded-md overflow-hidden ${solo === 'gateways' ? '' : 'hidden'}`}>
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

      <div className={`border rounded-md overflow-hidden ${solo === 'devices' ? '' : 'hidden'}`}>
        <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
          <button onClick={() => setOpenDev(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
            <ChevronRight className={`h-4 w-4 transition-transform ${openDev ? 'rotate-90' : ''}`} />
            Dispositivos <span className="text-xs text-muted-foreground">({cfg.devices.length})</span>
          </button>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button disabled={fullB} title={fullB ? limitMsg : undefined}><Plus className="h-4 w-4" />Agregar Bomba</Button>
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
                        {!editDev.gateway && <EnlaceSelect value={editDev.enlace} onChange={(v) => setEditDev({ ...editDev, enlace: v })} className="h-7 w-36 rounded-md border border-input bg-background px-2 text-xs" />}
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
                                      const owner = editDev.enabled !== false ? slotOwner(editDev.gateway, s.id, editIdx) : undefined
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
                      <Button size="sm" onClick={() => saveEdit(i)}><Save className="h-3 w-3" />Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditIdx(-1)}><X className="h-3 w-3" /></Button>
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
                      <FueraServicioBtn on={!!d.fueraServicio} onClick={() => toggleFueraServicio(d)} />
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

      <div className={`border rounded-md overflow-hidden ${solo === 'meters' ? '' : 'hidden'}`}>
        <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
          <button onClick={() => setOpenMeters(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
            <ChevronRight className={`h-4 w-4 transition-transform ${openMeters ? 'rotate-90' : ''}`} />
            Medidores <span className="text-xs text-muted-foreground">({cfg.meters.length})</span>
          </button>
          <Dialog open={showAddMeter} onOpenChange={setShowAddMeter}>
            <DialogTrigger asChild>
              <Button disabled={fullMed || !hasMedidores} title={!hasMedidores ? 'La licencia no incluye medidores' : fullMed ? limitMsgMed : undefined}><Plus className="h-4 w-4" />Agregar Medidor</Button>
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
                <div><EnlaceSelect label="Conectado por" value={newMeter.enlace} onChange={(v) => setNewMeter({ ...newMeter, enlace: v })} /></div>
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
              <TableHead>Conexión</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meterRows().map((m, i) => (
              <TableRow key={m.name}>
                <TableCell><Switch checked={m.enabled} onCheckedChange={() => toggleMeter(i)} /></TableCell>
                {editMeterIdx === i && editMeter ? (
                  <>
                    <TableCell><Input value={editMeter.displayName} onChange={(e) => setEditMeter({ ...editMeter, displayName: e.target.value })} placeholder={m.name} className="min-w-56" />
                      <div className="text-[10px] text-muted-foreground mt-1">ID: {m.name}</div></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input value={editMeter.ip} onChange={(e) => setEditMeter({ ...editMeter, ip: e.target.value })} className="h-7 w-36" aria-label="IP" />
                        <Input type="number" value={editMeter.port} onChange={(e) => setEditMeter({ ...editMeter, port: +e.target.value })} className="h-7 w-20" aria-label="Puerto" />
                        <Input type="number" value={editMeter.unitId} onChange={(e) => setEditMeter({ ...editMeter, unitId: +e.target.value })} className="h-7 w-16" aria-label="Unit" />
                      </div>
                      <EnlaceSelect value={editMeter.enlace} onChange={(v) => setEditMeter({ ...editMeter, enlace: v })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs" /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" onClick={() => saveMeterEdit(i)}><Save className="h-3 w-3" />Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditMeterIdx(-1)}><X className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    {/* El ID interno identifica al medidor en el histórico: se muestra, no se edita */}
                    <TableCell className="whitespace-nowrap"><span className="font-bold text-sm">{m.displayName || m.name}</span>
                      {m.displayName && <span className="ml-2 text-[10px] text-muted-foreground">ID: {m.name}</span>}</TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap">{m.ip}:{m.port} · unit {m.unitId}</TableCell>
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

      {solo === 'flow' && <FlowmetersSection />}
      {solo === 'campo' && <><CampoSection kind="reco" /><CampoSection kind="reg" /></>}
      {solo === 'generadores' && <CampoSection kind="gen" />}
      {solo === 'comms' && <CommsSection />}
    </div>
  )
}
