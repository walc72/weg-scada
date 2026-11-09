import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { AppConfig } from '../../types'
import { useLicense } from '../../store/license'
import { SeccionConfig, useGuardando } from '../../components/config'
import { EnlaceSelect } from './CommsSection'
import { FilaGuardado, PedidoDialog, type Pedido } from './filas'

type MeterRow = { name: string; displayName: string; ip: string; port: number; unitId: number; enabled: boolean; enlace?: string }

export default function MedidoresTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const fullMed = useLicense(l => l.full('medidores'))
  const limitMsgMed = useLicense(l => l.limitMsg('medidores'))
  const hasMedidores = useLicense(l => l.hasModule('medidores'))
  const [guardando, correr] = useGuardando()
  const [editMeter, setEditMeter] = useState<MeterRow | null>(null)  // editMeter.name = ID del medidor (no editable)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [showAddMeter, setShowAddMeter] = useState(false)
  const [newMeter, setNewMeter] = useState<{ name: string; type: 'PM8000' | 'PM7400'; ip: string; port: number; unitId: number; site: string; enlace?: string }>({
    name: '', type: 'PM8000', ip: '', port: 502, unitId: 1, site: ''
  })

  function meterRows(): MeterRow[] {
    return cfg.meters.map(m => ({
      name: m.name,
      displayName: cfg.meterNames?.[m.name] ?? '',
      ip: m.ip,
      port: m.port,
      unitId: m.unitId,
      enabled: m.enabled !== false,
      enlace: m.enlace,
    }))
  }

  // Guarda solo el medidor `name` (sobre la config vigente)
  const conMeter = (name: string, f: (m: AppConfig['meters'][number]) => AppConfig['meters'][number], c: AppConfig) =>
    c.meters.map(m => m.name === name ? f(m) : m)

  async function saveMeterEdit() {
    if (!editMeter) return
    const e = editMeter
    const ok = await store.guardar(c => {
      const meterNames: Record<string, string> = { ...c.meterNames }
      if (e.displayName) meterNames[e.name] = e.displayName
      else delete meterNames[e.name]
      return { ...c, meters: conMeter(e.name, m => ({ ...m, ip: e.ip, port: e.port, unitId: e.unitId, enlace: e.enlace }), c), meterNames }
    })
    if (ok) { toast.success('Medidor actualizado'); setEditMeter(null) }
  }

  function pedirEnabled(m: MeterRow) {
    const label = m.displayName || m.name
    setPedido({
      titulo: m.enabled ? `¿Deshabilitar ${label}?` : `¿Habilitar ${label}?`,
      mensaje: m.enabled ? 'Deja de consultarse: sin lecturas ni alarmas.' : 'Vuelve a consultarse.',
      textoConfirmar: m.enabled ? 'DESHABILITAR' : 'HABILITAR',
      accion: () => store.guardar(c => ({ ...c, meters: conMeter(m.name, x => ({ ...x, enabled: !m.enabled }), c) })),
    })
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
    if (await store.guardar(c => ({ ...c, meters: [...c.meters, meter] }))) {
      toast.success('Medidor agregado')
      setShowAddMeter(false)
      setNewMeter({ name: '', type: 'PM8000', ip: '', port: 502, unitId: 1, site: '' })
    }
  }

  function pedirBorrar(m: MeterRow) {
    setPedido({
      titulo: `¿Borrar ${m.displayName || m.name}?`,
      mensaje: 'Se quita de la configuración junto con su nombre visible. No se puede deshacer.',
      textoConfirmar: 'BORRAR', peligro: true,
      accion: async () => {
        const ok = await store.guardar(c => {
          const meterNames: Record<string, string> = { ...c.meterNames }
          delete meterNames[m.name]
          return { ...c, meters: c.meters.filter(x => x.name !== m.name), meterNames }
        })
        if (ok) toast.success(`${m.name} eliminado`)
      },
    })
  }

  return (
    <div className="space-y-4">
      <SeccionConfig titulo="MEDIDORES" acciones={
        <Dialog open={showAddMeter} onOpenChange={setShowAddMeter}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={fullMed || !hasMedidores} title={!hasMedidores ? 'La licencia no incluye medidores' : fullMed ? limitMsgMed : undefined}><Plus className="h-4 w-4" />AGREGAR MEDIDOR</Button>
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
              <Button variant="outline" onClick={() => setShowAddMeter(false)}>CANCELAR</Button>
              <Button onClick={() => correr(addMeter)} disabled={guardando}>AGREGAR</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">On</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Conexión</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meterRows().map((m) => (
              <TableRow key={m.name}>
                <TableCell><Switch checked={m.enabled} disabled={guardando} aria-label={`Habilitar ${m.displayName || m.name}`} onCheckedChange={() => pedirEnabled(m)} /></TableCell>
                {editMeter?.name === m.name ? (
                  <>
                    <TableCell><Input value={editMeter.displayName} onChange={(e) => setEditMeter({ ...editMeter, displayName: e.target.value })} placeholder={m.name} className="min-w-56" />
                      <div className="text-[10px] text-muted-foreground mt-1">ID: {m.name}</div></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input value={editMeter.ip} onChange={(e) => setEditMeter({ ...editMeter, ip: e.target.value })} className="h-7 w-36" aria-label="IP" />
                        <Input type="number" value={editMeter.port} onChange={(e) => setEditMeter({ ...editMeter, port: +e.target.value })} className="h-7 w-20" aria-label="Puerto" />
                        <Input type="number" value={editMeter.unitId} onChange={(e) => setEditMeter({ ...editMeter, unitId: +e.target.value })} className="h-7 w-16" aria-label="Unit" />
                      </div>
                      <EnlaceSelect value={editMeter.enlace} onChange={(v) => setEditMeter({ ...editMeter, enlace: v })} className="mt-1 h-7 w-full text-xs" /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <FilaGuardado guardando={guardando} onDescartar={() => setEditMeter(null)} onGuardar={() => correr(saveMeterEdit)} />
                    </TableCell>
                  </>
                ) : (
                  <>
                    {/* El ID interno identifica al medidor en el histórico: se muestra, no se edita */}
                    <TableCell className="whitespace-nowrap"><span className="font-bold text-sm">{m.displayName || m.name}</span>
                      {m.displayName && <span className="ml-2 text-[10px] text-muted-foreground">ID: {m.name}</span>}</TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap">{m.ip}:{m.port} · unit {m.unitId}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" aria-label={`Editar ${m.name}`} onClick={() => setEditMeter({ ...m })}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Borrar ${m.name}`} className="text-destructive hover:text-destructive" disabled={guardando} onClick={() => pedirBorrar(m)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {cfg.meters.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-4 text-center text-sm text-muted-foreground">Todavía no hay medidores.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </SeccionConfig>
      <PedidoDialog pedido={pedido} onCerrar={() => setPedido(null)} correr={correr} />
    </div>
  )
}
