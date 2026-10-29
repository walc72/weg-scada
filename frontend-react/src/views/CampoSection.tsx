// Configuración → Dispositivos: reconectadores y reguladores (módulo unifilar).
// Cada equipo lleva su mapa de registros, editable (MapaEditor); el modelo trae uno por defecto.
import { useEffect, useState } from 'react'
import { useConfigStore } from '../store/config'
import { useDrivesStore } from '../store/drives'
import { useLicense } from '../store/license'
import { authFetch } from '../store/auth'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../components/ui/dialog'
import { Plus, Trash2, Pencil, Save, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { CampoConfig, CampoState, Punto } from '../types'
import { SinEnlaceBadge } from '@/components/SinEnlaceBadge'
import { EnlaceSelect } from './CommsSection'
import { MapaEditor } from './MapaEditor'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const SELECT_CLS = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
type Modelos = Record<string, { kind: 'reco' | 'reg'; nombre: string; descripcion?: string; protocolo?: 'dnp3'; port?: number; dnp3?: { outstation: number; maestro: number }; mapa: Punto[] }>

const MODELOS_UI = {
  reco: [['pmsetu', 'PMSet U'], ['otro', 'Otro']],
  reg: [['tsea', 'TSEA'], ['tsea-dnp3', 'TSEA (DNP3)'], ['tapelectro', 'Tapelectro'], ['otro', 'Otro']],
}
const TITULO = { reco: 'Reconectadores', reg: 'Reguladores' }
const SINGULAR = { reco: 'Reconectador', reg: 'Regulador' }
// `otro` → `otro-<kind>`
const modeloId = (kind: 'reco' | 'reg', modelo: string) => modelo === 'otro' ? `otro-${kind}` : modelo

function stateBadge(c: CampoConfig, st?: CampoState) {
  if (c.enabled === false) return <Badge variant="secondary">Desactivado</Badge>
  if (st?.license === 'excedido') return <Badge variant="warning">Fuera de licencia</Badge>
  if (!st) return <Badge variant="secondary">Sin datos</Badge>
  if (!st.online && st.sinEnlace) return <SinEnlaceBadge name={st.sinEnlace} />
  return st.online ? <Badge variant="success">ONLINE</Badge> : <Badge variant="destructive">OFFLINE</Badge>
}

export function CampoSection({ kind }: { kind: 'reco' | 'reg' }) {
  const store = useConfigStore()
  const cfg = store.config!
  const hasModule = useLicense(l => l.hasModule('unifilar'))
  const fullB = useLicense(l => l.full('B'))
  const limitMsg = useLicense(l => l.lic ? `Límite de la licencia: nivel B ${l.lic.uso.B}/${l.lic.limites.B}` : '')
  const campo = useDrivesStore(s => s.campo)
  const [open, setOpen] = useState(true)
  const [modelos, setModelos] = useState<Modelos>({})
  const [form, setForm] = useState<CampoConfig | null>(null)
  const [orig, setOrig] = useState<string | null>(null)  // null = nuevo

  useEffect(() => {
    if (!hasModule) return
    authFetch(`${API_BASE}/modelos`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setModelos).catch(() => { /* sin modelos: se edita el mapa a mano */ })
  }, [hasModule])
  if (!hasModule) return null

  const key = kind === 'reco' ? 'reconectadores' : 'reguladores'
  const list: CampoConfig[] = cfg[key] || []
  const defMapa = (modelo: string): Punto[] => structuredClone(modelos[modeloId(kind, modelo)]?.mapa ?? [])
  const nuevo = (): CampoConfig => ({
    name: '', modelo: MODELOS_UI[kind][0][0], ip: '', port: 502, unitId: 1, enabled: true,
    ...(kind === 'reg' ? { tapMin: -16, tapMax: 16 } : {}), mapa: defMapa(MODELOS_UI[kind][0][0]),
  })

  async function commit(next: CampoConfig[], ok: string) {
    store.setConfig({ ...cfg, [key]: next })
    if (await store.save()) { toast.success(ok); return true }
    return false
  }

  async function saveForm() {
    if (!form) return
    const name = form.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!form.ip.trim()) { toast.error('IP obligatoria'); return }
    // el nombre es único entre ambas listas (identifica al equipo en el estado en vivo)
    const otros = [...(cfg.reconectadores || []), ...(cfg.reguladores || [])]
    if (otros.some(c => c.name === name && c.name !== orig)) { toast.error('Ya existe un equipo con ese nombre'); return }
    const banco = form.banco?.trim() || undefined
    if (kind === 'reg' && banco && list.filter(x => x.banco === banco && x.name !== orig).length >= 3) { toast.error(`El banco ${banco} ya tiene 3 reguladores`); return }
    const c = { ...form, name, ip: form.ip.trim(), banco }
    const next = orig === null ? [...list, c] : list.map(x => x.name === orig ? c : x)
    if (await commit(next, orig === null ? `${SINGULAR[kind]} agregado` : `${SINGULAR[kind]} actualizado`)) setForm(null)
  }

  async function del(name: string) {
    if (!confirm(`¿Eliminar ${name}?`)) return
    await commit(list.filter(c => c.name !== name), `${name} eliminado`)
  }

  const toggle = (name: string) => commit(list.map(c => c.name === name ? { ...c, enabled: c.enabled === false } : c), `${SINGULAR[kind]} actualizado`)

  // Cambiar modelo: copia el mapa del nuevo; si el actual fue editado, pide confirmar
  function cambiarModelo(modelo: string) {
    if (!form) return
    const editado = JSON.stringify(form.mapa) !== JSON.stringify(defMapa(form.modelo))
    if (editado && !confirm('El mapa fue modificado. ¿Reemplazarlo por el del nuevo modelo?')) return
    // El protocolo/puerto/outstation vienen del modelo; con Modbus se quitan protocolo y dnp3
    const m = modelos[modeloId(kind, modelo)]
    const { protocolo: _p, dnp3: _d, ...base } = form
    setForm({ ...base, modelo, mapa: defMapa(modelo), port: m?.port ?? 502,
      ...(m?.protocolo === 'dnp3' ? { protocolo: 'dnp3', dnp3: { ...m.dnp3! }, unitId: undefined } : { unitId: form.unitId ?? 1 }) })
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center justify-between pr-4 border-b bg-muted/40">
        <button onClick={() => setOpen(v => !v)} className="flex-1 flex items-center gap-2 px-4 py-3 font-semibold text-sm hover:bg-muted/60">
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          {TITULO[kind]} <span className="text-xs text-muted-foreground">({list.length})</span>
        </button>
        <Button disabled={fullB} title={fullB ? limitMsg : undefined} onClick={() => { setOrig(null); setForm(nuevo()) }}>
          <Plus className="h-4 w-4" />Agregar {SINGULAR[kind]}
        </Button>
      </div>
      {open && <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">On</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Modelo</TableHead>
            <TableHead>IP</TableHead>
            <TableHead className="text-center">ID</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map(c => (
            <TableRow key={c.name}>
              <TableCell><Switch checked={c.enabled !== false} onCheckedChange={() => toggle(c.name)} /></TableCell>
              <TableCell className="font-bold text-sm">{c.name}</TableCell>
              <TableCell className="text-sm">{MODELOS_UI[kind].find(m => m[0] === c.modelo)?.[1] ?? c.modelo}</TableCell>
              <TableCell className="text-sm">{c.ip}:{c.port ?? 502}</TableCell>
              <TableCell className="text-center">{c.unitId ?? 1}</TableCell>
              <TableCell className="text-center">{stateBadge(c, campo.get(c.name))}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => { setOrig(c.name); setForm(structuredClone(c)) }}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => del(c.name)}><Trash2 className="h-3 w-3" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-4">Sin {TITULO[kind].toLowerCase()}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>}

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-5xl">
          <DialogHeader><DialogTitle>{orig === null ? `Agregar ${SINGULAR[kind]}` : `Editar ${orig}`}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nombre</Label><Input value={form.name} disabled={orig !== null} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Modelo</Label>
                <select className={SELECT_CLS} value={form.modelo} onChange={(e) => cambiarModelo(e.target.value)}>
                  {MODELOS_UI[kind].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className={`grid gap-3 ${form.protocolo === 'dnp3' ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <div><Label>IP</Label><Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.10.x" /></div>
              <div><Label>Puerto</Label><Input type="number" value={form.port ?? 502} onChange={(e) => setForm({ ...form, port: +e.target.value })} /></div>
              {form.protocolo === 'dnp3' ? <>
                <div><Label>Outstation</Label><Input type="number" min={0} value={form.dnp3?.outstation ?? 10} onChange={(e) => setForm({ ...form, dnp3: { maestro: 1, ...form.dnp3, outstation: +e.target.value } })} /></div>
                <div><Label>Maestro</Label><Input type="number" min={0} value={form.dnp3?.maestro ?? 1} onChange={(e) => setForm({ ...form, dnp3: { outstation: 10, ...form.dnp3, maestro: +e.target.value } })} /></div>
              </> : <div><Label>ID (Unit)</Label><Input type="number" value={form.unitId ?? 1} onChange={(e) => setForm({ ...form, unitId: +e.target.value })} /></div>}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled !== false} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /><Label>Habilitado</Label>
            </div>
            <div><EnlaceSelect label="Conectado por" value={form.enlace} onChange={(v) => setForm({ ...form, enlace: v })} /></div>
            {kind === 'reg' && <div>
              <Label>Banco</Label>
              <Input list="bancos" value={form.banco ?? ''} placeholder="Sin banco (p. ej. RUA-01 Tapelectro)"
                onChange={(e) => setForm({ ...form, banco: e.target.value || undefined })} />
              <datalist id="bancos">{[...new Set(list.map(c => c.banco).filter(Boolean))].map(b => <option key={b} value={b} />)}</datalist>
              <p className="text-xs text-muted-foreground mt-1">Agrupa hasta 3 reguladores monofásicos del mismo equipo: fases a 0°, −120° y 120° según el orden en la lista.</p>
            </div>}
            {kind === 'reg' && <div className="grid grid-cols-2 gap-3">
              <div><Label>Tap mínimo</Label><Input type="number" value={form.tapMin ?? -16} onChange={(e) => setForm({ ...form, tapMin: +e.target.value })} /></div>
              <div><Label>Tap máximo</Label><Input type="number" value={form.tapMax ?? 16} onChange={(e) => setForm({ ...form, tapMax: +e.target.value })} /></div>
            </div>}
            <MapaEditor kind={kind} protocolo={form.protocolo} mapa={form.mapa} live={orig ? campo.get(orig) : undefined}
              onChange={(mapa) => setForm({ ...form, mapa })}
              onRestore={() => { if (confirm('¿Restaurar el mapa por defecto del modelo? Se pierden los cambios.')) setForm({ ...form, mapa: defMapa(form.modelo) }) }} />
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
