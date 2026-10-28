// Configuración → Dispositivos: equipos de comunicación (antenas airMAX / routers RUT)
// y el selector «Conectado por» de los demás equipos. Sin el módulo no se muestra nada.
import { useState } from 'react'
import { useConfigStore } from '../store/config'
import { useDrivesStore } from '../store/drives'
import { useLicense } from '../store/license'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../components/ui/dialog'
import { Plus, Trash2, Pencil, Save, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { AppConfig, CommConfig, CommState } from '../types'

const EMPTY: CommConfig = { name: '', tipo: 'airmax', ip: '', community: '', enabled: true }
const SELECT_CLS = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

// <select> nativo (Radix no admite valor vacío): '' = sin enlace = undefined.
// No muestra nada sin el módulo (el server rechaza guardar comms sin licencia).
export function EnlaceSelect({ value, onChange, exclude, className, label }: {
  value?: string; onChange: (v: string | undefined) => void; exclude?: string; className?: string; label?: string
}) {
  const hasModule = useLicense(l => l.hasModule('comunicaciones'))
  const comms = useConfigStore(s => s.config?.comms) || []
  if (!hasModule) return null
  return (
    <>
    {label && <Label>{label}</Label>}
    <select
      title="Conectado por" aria-label="Conectado por"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={className ?? SELECT_CLS}
    >
      <option value="">— ninguno —</option>
      {comms.filter(c => c.name !== exclude).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
    </select>
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
  const [open, setOpen] = useState(true)
  const [form, setForm] = useState<CommConfig | null>(null)
  const [orig, setOrig] = useState<string | null>(null)  // null = nuevo
  if (!hasModule) return null
  const comms = cfg.comms || []

  async function commit(next: Partial<AppConfig>, ok: string) {
    store.setConfig({ ...cfg, ...next })
    if (await store.save()) { toast.success(ok); return true }
    return false
  }

  // Nombres de todo lo que apunta a `name` por «Conectado por»
  function usedBy(name: string) {
    return [
      ...cfg.gateways.filter(g => g.enlace === name),
      ...cfg.devices.filter(d => d.enlace === name),
      ...cfg.meters.filter(m => m.enlace === name),
      ...(cfg.flowmeters || []).filter(f => f.enlace === name),
      ...comms.filter(c => c.enlace === name),
    ].map(x => x.name)
  }

  async function saveForm() {
    if (!form) return
    const name = form.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!form.ip.trim()) { toast.error('IP obligatoria'); return }
    if (comms.some(c => c.name === name && c.name !== orig)) { toast.error('Ya existe un equipo con ese nombre'); return }
    const { community, ...rest } = form
    const comm: CommConfig = { ...rest, name, ip: form.ip.trim(), ...(community?.trim() ? { community: community.trim() } : {}) }
    if (orig === null) {
      if (await commit({ comms: [...comms, comm] }, 'Equipo agregado')) setForm(null)
      return
    }
    // Renombre: los `enlace` que apuntaban al nombre viejo van al nuevo, en el mismo guardado
    const re = <T extends { enlace?: string }>(x: T): T => name !== orig && x.enlace === orig ? { ...x, enlace: name } : x
    const next: Partial<AppConfig> = {
      comms: comms.map(c => c.name === orig ? comm : re(c)),
      gateways: cfg.gateways.map(re),
      devices: cfg.devices.map(re),
      meters: cfg.meters.map(re),
      ...(cfg.flowmeters ? { flowmeters: cfg.flowmeters.map(re) } : {}),
    }
    if (await commit(next, 'Equipo actualizado')) setForm(null)
  }

  async function del(name: string) {
    const used = usedBy(name)
    if (used.length) { toast.error(`No se puede eliminar: lo usan ${used.join(', ')}`); return }
    if (!confirm(`¿Eliminar ${name}?`)) return
    await commit({ comms: comms.filter(c => c.name !== name) }, `${name} eliminado`)
  }

  const toggle = (name: string) => commit({ comms: comms.map(c => c.name === name ? { ...c, enabled: c.enabled === false } : c) }, 'Equipo actualizado')

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
        <button onClick={() => setOpen(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          Equipos de comunicación <span className="text-xs text-muted-foreground">({comms.length})</span>
        </button>
        <Button onClick={() => { setOrig(null); setForm({ ...EMPTY }) }}>
          <Plus className="h-4 w-4" />Agregar Equipo
        </Button>
      </div>
      {open && <Table>
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
              <TableCell><Switch checked={c.enabled !== false} onCheckedChange={() => toggle(c.name)} /></TableCell>
              <TableCell className="font-bold text-sm">{c.name}</TableCell>
              <TableCell className="text-sm">{c.tipo === 'airmax' ? 'airMAX' : 'RUT'}</TableCell>
              <TableCell className="text-sm">{c.ip}</TableCell>
              <TableCell className="text-sm">{c.community || '-'}</TableCell>
              <TableCell className="text-sm">{c.enlace || '-'}</TableCell>
              <TableCell className="text-center">{stateBadge(c, live.get(c.name))}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => { setOrig(c.name); setForm({ ...EMPTY, ...c }) }}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => del(c.name)}><Trash2 className="h-3 w-3" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {comms.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-4">Sin equipos de comunicación</TableCell></TableRow>
          )}
        </TableBody>
      </Table>}

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{orig === null ? 'Agregar Equipo de comunicación' : `Editar ${orig}`}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Antena Torre Norte" /></div>
            <div>
              <Label>Tipo</Label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as 'airmax' | 'rut' })} className={SELECT_CLS}>
                <option value="airmax">Antena Ubiquiti airMAX</option>
                <option value="rut">Router Teltonika RUT</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>IP</Label><Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.10.x" /></div>
              <div><Label>Community SNMP</Label><Input value={form.community ?? ''} onChange={(e) => setForm({ ...form, community: e.target.value })} placeholder="public" /></div>
            </div>
            <div>
              <Label>Depende de</Label>
              <EnlaceSelect value={form.enlace} exclude={orig ?? form.name.trim()} onChange={(v) => setForm({ ...form, enlace: v })} />
            </div>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={saveForm}><Save className="h-4 w-4" />Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
