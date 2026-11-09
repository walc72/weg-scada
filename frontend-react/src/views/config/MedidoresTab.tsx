import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, Pencil, Save, X, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { AppConfig } from '../../types'
import { useLicense } from '../../store/license'
import { EnlaceSelect } from './CommsSection'

type MeterRow = { name: string; displayName: string; ip: string; port: number; unitId: number; enabled: boolean; enlace?: string }

export default function MedidoresTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const fullMed = useLicense(l => l.full('medidores'))
  const limitMsgMed = useLicense(l => l.limitMsg('medidores'))
  const hasMedidores = useLicense(l => l.hasModule('medidores'))
  const [editMeterIdx, setEditMeterIdx] = useState(-1)
  const [editMeter, setEditMeter] = useState<MeterRow | null>(null)
  const [openMeters, setOpenMeters] = useState(true)
  const [showAddMeter, setShowAddMeter] = useState(false)
  const [newMeter, setNewMeter] = useState<{ name: string; type: 'PM8000' | 'PM7400'; ip: string; port: number; unitId: number; site: string; enlace?: string }>({
    name: '', type: 'PM8000', ip: '', port: 502, unitId: 1, site: ''
  })

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
      <div className="border rounded-md overflow-hidden">
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
    </div>
  )
}
