// Configuración → Dispositivos: caudalímetros TUF-2000 (por PAS600) y el caudal
// de cada bomba (módulo caudales, spec §4.3). Sin el módulo no se muestra nada.
import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { useDrivesStore } from '../../store/drives'
import { useLicense } from '../../store/license'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Checkbox } from '../../components/ui/checkbox'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, Pencil, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { DeviceConfig, FlowmeterConfig, FlowmeterState } from '../../types'
import { aLps, desdeLps, fmtFlow, flowmeterOf, colectorLabel, UNIDAD_CAUDAL } from '@/lib/flow'
import { SinEnlaceBadge } from '@/components/SinEnlaceBadge'
import { EnlaceSelect } from './CommsSection'
import { SeccionConfig, useGuardando } from '../../components/config'
import { PedidoDialog, pedidoBorrar, pedidoHabilitar, type Pedido } from './filas'
import { editarEquipo, guardarEquipo } from './equipos'

const EMPTY: FlowmeterConfig = { name: '', type: 'TUF2000', ip: '', port: 502, unitId: 1, wordOrder: 'LE', totalMultiplier: 1, bombas: [], enabled: true }

function stateBadge(f: FlowmeterConfig, st?: FlowmeterState) {
  if (f.enabled === false) return <Badge variant="secondary">Desactivado</Badge>
  if (st?.license === 'excedido') return <Badge variant="warning">Fuera de licencia</Badge>
  if (!st) return <Badge variant="secondary">Sin datos</Badge>
  if (!st.online && st.sinEnlace) return <SinEnlaceBadge name={st.sinEnlace} />
  if (!st.online) return <Badge variant="destructive">OFFLINE</Badge>
  if (st.error || st.flow == null) return <Badge variant="warning" title="Código de error del TUF-2000">{st.error ? `Sin señal (código ${st.error})` : 'Sin señal'}</Badge>
  return <Badge variant="success">ONLINE</Badge>
}

export function FlowmetersSection() {
  const store = useConfigStore()
  const cfg = store.config!
  const hasModule = useLicense(l => l.hasModule('caudales'))
  const fullA = useLicense(l => l.full('caudalimetros'))
  const limitMsg = useLicense(l => l.limitMsg('caudalimetros'))
  const live = useDrivesStore(s => s.flowmeters)
  const [guardando, correr] = useGuardando()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [form, setForm] = useState<FlowmeterConfig | null>(null)
  const [orig, setOrig] = useState<string | null>(null)  // null = nuevo
  if (!hasModule) return null
  const fms = cfg.flowmeters || []

  async function saveForm() {
    if (!form) return
    const name = form.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!form.ip.trim()) { toast.error('IP obligatoria'); return }
    if (!form.bombas.length) { toast.error('Elegí al menos una bomba'); return }
    if (orig === null && fms.some(f => f.name === name)) { toast.error('Ya existe un caudalímetro con ese nombre'); return }
    const fm = { ...form, name, ip: form.ip.trim() }
    if (await store.guardar(c => ({ ...c, flowmeters: guardarEquipo(c.flowmeters, orig, fm) }))) {
      toast.success(orig === null ? 'Caudalímetro agregado' : 'Caudalímetro actualizado')
      setForm(null)
    }
  }

  const pedirEnabled = (f: FlowmeterConfig) => setPedido(pedidoHabilitar(f.name, f.enabled !== false,
    () => store.guardar(c => ({ ...c, flowmeters: editarEquipo(c.flowmeters, f.name, x => ({ ...x, enabled: f.enabled === false })) }))))

  const pedirBorrar = (name: string) => setPedido(pedidoBorrar(name, async () => {
    if (await store.guardar(c => ({ ...c, flowmeters: (c.flowmeters || []).filter(f => f.name !== name) }))) toast.success(`${name} eliminado`)
  }))

  const setPump = (b: string, on: boolean) => form && setForm({ ...form, bombas: on ? [...form.bombas, b] : form.bombas.filter(x => x !== b) })

  return (
    <SeccionConfig titulo={`CAUDALÍMETROS (${fms.length})`} acciones={
      <Button size="sm" disabled={fullA} title={fullA ? limitMsg : undefined} onClick={() => { setOrig(null); setForm({ ...EMPTY, bombas: [] }) }}>
        <Plus className="h-4 w-4" />AGREGAR CAUDALÍMETRO
      </Button>
    }>
      <Table>
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
                <TableCell><Switch checked={f.enabled !== false} disabled={guardando} aria-label={`Habilitar ${f.name}`} onCheckedChange={() => pedirEnabled(f)} /></TableCell>
                <TableCell className="font-bold text-sm">{f.name}</TableCell>
                <TableCell className="text-xs font-mono">{f.ip}:{f.port}</TableCell>
                <TableCell className="text-center font-mono">{f.unitId}</TableCell>
                <TableCell className="text-sm">{f.bombas.join(', ') || '—'}</TableCell>
                <TableCell className="text-center">{stateBadge(f, st)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{ok ? `${fmtFlow(st!.flow)} ${UNIDAD_CAUDAL}` : '—'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" aria-label={`Editar ${f.name}`} onClick={() => { setOrig(f.name); setForm({ ...EMPTY, ...f, bombas: [...f.bombas] }) }}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Borrar ${f.name}`} className="text-destructive hover:text-destructive" disabled={guardando} onClick={() => pedirBorrar(f.name)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            )
          })}
          {fms.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-4">Todavía no hay caudalímetros.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{orig === null ? 'Agregar caudalímetro' : `Editar ${orig}`}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={form.name} disabled={orig !== null} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Colector Norte" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1"><Label>IP del PAS600</Label><Input className="font-mono" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.10.x" /></div>
              <div><Label>Puerto</Label><Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: +e.target.value })} /></div>
              <div><Label>ID (Unit)</Label><Input type="number" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: +e.target.value })} /></div>
            </div>
            <div><EnlaceSelect label="Conectado por" value={form.enlace} onChange={(v) => setForm({ ...form, enlace: v })} /></div>
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
                  <Label key={d.name} className={`flex items-center gap-2 text-sm normal-case tracking-normal font-normal text-foreground cursor-pointer select-none ${taken ? 'opacity-60' : ''}`} title={taken ? `Ya está en el caudalímetro ${other!.name}` : undefined}>
                    <Checkbox disabled={taken} checked={form.bombas.includes(d.name)} onCheckedChange={(on) => setPump(d.name, on)} />
                    {d.name}
                    {taken && <span className="text-xs text-muted-foreground">— ya está en {other!.name}</span>}
                  </Label>
                )
              })}
            </div>
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>CANCELAR</Button>
            <Button onClick={() => correr(saveForm)} disabled={guardando}><Save className="h-4 w-4" />GUARDAR</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PedidoDialog pedido={pedido} onCerrar={() => setPedido(null)} correr={correr} />
    </SeccionConfig>
  )
}

// Celda "Caudal" de la tabla de bombas + diálogo (Modo, Caudal nominal)
export function PumpCaudalCell({ dev }: { dev: DeviceConfig }) {
  const cfg = useConfigStore(s => s.config)!
  const guardar = useConfigStore(s => s.guardar)
  const [guardando, correr] = useGuardando()
  const [form, setForm] = useState<{ modo: 'none' | 'manual' | 'real'; nominal: number } | null>(null)
  const fm = flowmeterOf(cfg, dev.name)
  const c = dev.caudal
  const lpsDe = (m3h: number) => +aLps(m3h).toFixed(1)

  async function save() {
    if (!form) return
    if (form.modo === 'manual' && !(form.nominal > 0)) { toast.error('Ingresá el caudal nominal'); return }
    // form.nominal en L/s; en config va en m³/h. Si no se tocó el campo se conserva el guardado (sin redondear)
    const m3h = c && form.nominal === lpsDe(c.nominal) ? c.nominal : desdeLps(Math.max(0, form.nominal || 0))
    const caudal = form.modo === 'none' ? undefined : { modo: form.modo, nominal: m3h }
    const ok = await guardar(cf => ({
      ...cf,
      devices: cf.devices.map(d => {
        if (d.name !== dev.name) return d
        const { caudal: _old, ...rest } = d
        return caudal ? { ...rest, caudal } : rest
      }),
    }))
    if (ok) { toast.success('Caudal guardado'); setForm(null) }
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-auto min-h-[26px] gap-1 px-1.5 text-left font-normal normal-case tracking-normal" onClick={() => setForm({ modo: c?.modo ?? 'none', nominal: lpsDe(c?.nominal ?? 0) })} title="Configurar caudal">
        <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
        {!c ? <span className="text-muted-foreground">Sin caudal</span>
          : c.modo === 'manual' ? `Manual ${fmtFlow(c.nominal)} ${UNIDAD_CAUDAL}`
          : fm && fm.bombas.length > 1 ? colectorLabel(fm.name) : 'Real'}
      </Button>
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
              <Label>Caudal nominal ({UNIDAD_CAUDAL})</Label>
              <Input type="number" min={0} step="any" value={form.nominal} disabled={form.modo === 'none'} onChange={(e) => setForm({ ...form, nominal: +e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">En modo Manual se toma este caudal mientras la bomba está en marcha.</p>
            </div>
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={() => correr(save)} disabled={guardando}><Save className="h-4 w-4" />Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
