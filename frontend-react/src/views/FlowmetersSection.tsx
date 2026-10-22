// Configuración → Dispositivos: caudalímetros TUF-2000 (por PAS600) y el caudal
// de cada bomba (módulo caudales, spec §4.3). Sin el módulo no se muestra nada.
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import { Plus, Trash2, Pencil, Save, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { DeviceConfig, FlowmeterConfig, FlowmeterState } from '../types'
import { fmtFlow, flowmeterOf, colectorLabel } from '@/lib/flow'

const EMPTY: FlowmeterConfig = { name: '', type: 'TUF2000', ip: '', port: 502, unitId: 1, wordOrder: 'LE', totalMultiplier: 1, bombas: [], enabled: true }

function stateBadge(f: FlowmeterConfig, st?: FlowmeterState) {
  if (f.enabled === false) return <Badge variant="secondary">Desactivado</Badge>
  if (st?.license === 'excedido') return <Badge variant="warning">Fuera de licencia</Badge>
  if (!st) return <Badge variant="secondary">Sin datos</Badge>
  if (!st.online) return <Badge variant="destructive">OFFLINE</Badge>
  if (st.error || st.flow == null) return <Badge variant="warning" title="Código de error del TUF-2000">{st.error ? `Sin señal (código ${st.error})` : 'Sin señal'}</Badge>
  return <Badge variant="success">ONLINE</Badge>
}

export function FlowmetersSection() {
  const store = useConfigStore()
  const cfg = store.config!
  const hasModule = useLicense(l => l.hasModule('caudales'))
  const fullA = useLicense(l => l.full('A'))
  const limitMsg = useLicense(l => l.lic ? `Límite de la licencia: nivel A ${l.lic.uso.A}/${l.lic.limites.A}` : '')
  const live = useDrivesStore(s => s.flowmeters)
  const [open, setOpen] = useState(true)
  const [form, setForm] = useState<FlowmeterConfig | null>(null)
  const [orig, setOrig] = useState<string | null>(null)  // null = nuevo
  if (!hasModule) return null
  const fms = cfg.flowmeters || []

  async function commit(next: FlowmeterConfig[], ok: string) {
    store.setConfig({ ...cfg, flowmeters: next })
    if (await store.save()) { toast.success(ok); return true }
    return false
  }

  async function saveForm() {
    if (!form) return
    const name = form.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!form.ip.trim()) { toast.error('IP obligatoria'); return }
    if (!form.bombas.length) { toast.error('Elegí al menos una bomba'); return }
    if (orig === null && fms.some(f => f.name === name)) { toast.error('Ya existe un caudalímetro con ese nombre'); return }
    const fm = { ...form, name, ip: form.ip.trim() }
    const next = orig === null ? [...fms, fm] : fms.map(f => f.name === orig ? fm : f)
    if (await commit(next, orig === null ? 'Caudalímetro agregado' : 'Caudalímetro actualizado')) setForm(null)
  }

  async function del(name: string) {
    if (!confirm(`¿Eliminar ${name}?`)) return
    await commit(fms.filter(f => f.name !== name), `${name} eliminado`)
  }

  const toggle = (name: string) => commit(fms.map(f => f.name === name ? { ...f, enabled: f.enabled === false } : f), 'Caudalímetro actualizado')

  const setPump = (b: string, on: boolean) => form && setForm({ ...form, bombas: on ? [...form.bombas, b] : form.bombas.filter(x => x !== b) })

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
        <button onClick={() => setOpen(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          Caudalímetros <span className="text-xs text-muted-foreground">({fms.length})</span>
        </button>
        <Button disabled={fullA} title={fullA ? limitMsg : undefined} onClick={() => { setOrig(null); setForm({ ...EMPTY, bombas: [] }) }}>
          <Plus className="h-4 w-4" />Agregar Caudalímetro
        </Button>
      </div>
      {open && <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">On</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>PAS600</TableHead>
            <TableHead className="text-center">ID</TableHead>
            <TableHead>Bombas</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="text-right">Caudal actual</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fms.map(f => {
            const st = live.get(f.name)
            const ok = f.enabled !== false && st?.online && !st.error && st.flow != null
            return (
              <TableRow key={f.name}>
                <TableCell><Switch checked={f.enabled !== false} onCheckedChange={() => toggle(f.name)} /></TableCell>
                <TableCell className="font-bold text-sm">{f.name}</TableCell>
                <TableCell className="text-sm">{f.ip}:{f.port}</TableCell>
                <TableCell className="text-center">{f.unitId}</TableCell>
                <TableCell className="text-sm">{f.bombas.join(', ') || '-'}</TableCell>
                <TableCell className="text-center">{stateBadge(f, st)}</TableCell>
                <TableCell className="text-right tabular-nums">{ok ? `${fmtFlow(st!.flow)} m³/h` : '-'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => { setOrig(f.name); setForm({ ...EMPTY, ...f, bombas: [...f.bombas] }) }}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => del(f.name)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            )
          })}
          {fms.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-4">Sin caudalímetros</TableCell></TableRow>
          )}
        </TableBody>
      </Table>}

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{orig === null ? 'Agregar Caudalímetro' : `Editar ${orig}`}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} disabled={orig !== null} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Colector Norte" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1"><Label>IP del PAS600</Label><Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.10.x" /></div>
              <div><Label>Puerto</Label><Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: +e.target.value })} /></div>
              <div><Label>ID (Unit)</Label><Input type="number" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: +e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Orden de palabras</Label>
                <Select value={form.wordOrder ?? 'LE'} onValueChange={(v) => setForm({ ...form, wordOrder: v as 'LE' | 'BE' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LE">LE (palabra baja primero)</SelectItem>
                    <SelectItem value="BE">BE (palabra alta primero)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Multiplicador del totalizador</Label><Input type="number" step="any" value={form.totalMultiplier ?? 1} onChange={(e) => setForm({ ...form, totalMultiplier: +e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Bombas</Label>
              <p className="text-xs text-muted-foreground">Una bomba = caudalímetro propio. Varias = colector (caudal compartido).</p>
              {cfg.devices.map(d => {
                const other = flowmeterOf(cfg, d.name)
                const taken = !!other && other.name !== orig
                return (
                  <label key={d.name} className={`flex items-center gap-2 text-sm ${taken ? 'opacity-60' : ''}`} title={taken ? `Ya está en el caudalímetro ${other!.name}` : undefined}>
                    <input type="checkbox" disabled={taken} checked={form.bombas.includes(d.name)} onChange={(e) => setPump(d.name, e.target.checked)} />
                    {d.name}
                    {taken && <span className="text-xs text-muted-foreground">— ya está en {other!.name}</span>}
                  </label>
                )
              })}
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

// Celda "Caudal" de la tabla de bombas + diálogo (Modo, Caudal nominal)
export function PumpCaudalCell({ dev }: { dev: DeviceConfig }) {
  const store = useConfigStore()
  const cfg = store.config!
  const [form, setForm] = useState<{ modo: 'none' | 'manual' | 'real'; nominal: number } | null>(null)
  const fm = flowmeterOf(cfg, dev.name)
  const c = dev.caudal

  async function save() {
    if (!form) return
    if (form.modo === 'manual' && !(form.nominal > 0)) { toast.error('Ingresá el caudal nominal'); return }
    const caudal = form.modo === 'none' ? undefined : { modo: form.modo, nominal: Math.max(0, form.nominal || 0) }
    const devices = cfg.devices.map(d => {
      if (d.name !== dev.name) return d
      const { caudal: _old, ...rest } = d
      return caudal ? { ...rest, caudal } : rest
    })
    store.setConfig({ ...cfg, devices })
    if (await store.save()) { toast.success('Caudal guardado'); setForm(null) }
  }

  return (
    <>
      <button className="text-sm hover:underline text-left" onClick={() => setForm({ modo: c?.modo ?? 'none', nominal: c?.nominal ?? 0 })} title="Configurar caudal">
        {!c ? <span className="text-muted-foreground">-</span>
          : c.modo === 'manual' ? `Manual ${fmtFlow(c.nominal)} m³/h`
          : fm && fm.bombas.length > 1 ? colectorLabel(fm.name) : 'Real'}
      </button>
      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Caudal — {dev.name}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div>
              <Label>Modo</Label>
              <Select value={form.modo} onValueChange={(v) => setForm({ ...form, modo: v as 'none' | 'manual' | 'real' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin caudal</SelectItem>
                  <SelectItem value="manual">Manual (caudal nominal en marcha)</SelectItem>
                  <SelectItem value="real" disabled={!fm}>Real (caudalímetro)</SelectItem>
                </SelectContent>
              </Select>
              {!fm
                ? <p className="text-xs text-muted-foreground mt-1">Real no está disponible: la bomba no está en ningún caudalímetro. Agregala en <strong>Caudalímetros</strong>.</p>
                : <p className="text-xs text-muted-foreground mt-1">Caudalímetro: {fm.name}{fm.bombas.length > 1 ? ` (colector, compartido con ${fm.bombas.filter(b => b !== dev.name).join(', ')})` : ''}.</p>}
            </div>
            <div>
              <Label>Caudal nominal (m³/h)</Label>
              <Input type="number" min={0} step="any" value={form.nominal} disabled={form.modo === 'none'} onChange={(e) => setForm({ ...form, nominal: +e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">En modo Manual se toma este caudal mientras la bomba está en marcha.</p>
            </div>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={save}><Save className="h-4 w-4" />Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
