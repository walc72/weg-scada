// Configuración → Dispositivos: reconectadores y reguladores (módulo unifilar) y generadores (módulo generadores).
// Cada equipo lleva su mapa de registros, editable (MapaEditor); el modelo trae uno por defecto.
import { useEffect, useState } from 'react'
import { useConfigStore } from '../../store/config'
import { useDrivesStore } from '../../store/drives'
import { useLicense } from '../../store/license'
import { authFetch } from '../../store/auth'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { ConfirmarDialog } from '../../components/ui/confirmar-dialog'
import { Plus, Trash2, Pencil, Save, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import type { CampoConfig, CampoKind, CampoState, Punto } from '../../types'
import { SinEnlaceBadge } from '@/components/SinEnlaceBadge'
import { SeccionConfig, useGuardando } from '../../components/config'
import { EnlaceSelect } from './CommsSection'
import { PedidoDialog, pedidoBorrar, pedidoHabilitar, type Pedido } from './filas'
import { editarEquipo, guardarEquipo } from './equipos'
import { MapaEditor } from '../MapaEditor'
import { API_BASE } from './comun'


type Modelos = Record<string, { kind: CampoKind; nombre: string; descripcion?: string; protocolo?: 'dnp3'; port?: number; dnp3?: { outstation: number; maestro: number }; mapa: Punto[] }>

const MODELOS_UI = {
  reco: [['pmsetu', 'Schneider ADVC (U-Series)'], ['otro', 'Otro']],
  reg: [['tsea', 'TSEA'], ['tsea-dnp3', 'TSEA (DNP3)'], ['tapelectro', 'Tapelectro'], ['otro', 'Otro']],
  gen: [['dse8610', 'Deep Sea DSE 8610 MKII'], ['il4', 'ComAp InteliLite 4 (AMF9/20/25)'], ['hgm6120', 'SmartGen HGM6120NC'], ['otro', 'Otro']],
}
const TITULO = { reco: 'RECONECTADORES', reg: 'REGULADORES', gen: 'GENERADORES' }
const SINGULAR = { reco: 'Reconectador', reg: 'Regulador', gen: 'Generador' }
const VACIO = { reco: 'Todavía no hay reconectadores.', reg: 'Todavía no hay reguladores.', gen: 'Todavía no hay generadores.' }
// lista de config y módulo de licencia de cada tipo
export const LISTA = { reco: 'reconectadores', reg: 'reguladores', gen: 'generadores' } as const
const MODULO = { reco: 'unifilar', reg: 'unifilar', gen: 'generadores' }
// `otro` → `otro-<kind>`
const modeloId = (kind: CampoKind, modelo: string) => modelo === 'otro' ? `otro-${kind}` : modelo

// Marca «fuera de servicio»: el equipo sigue en pantalla (gris), sin lecturas ni alarmas.
// Pide confirmación; `onCambiar` guarda solo la marca de ese equipo.
export function FueraServicioBtn({ on, nombre, onCambiar, disabled }: { on: boolean; nombre: string; onCambiar: () => void; disabled?: boolean }) {
  const [pedir, setPedir] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" aria-pressed={on} disabled={disabled} onClick={() => setPedir(true)} className={on ? 'bg-muted' : 'text-muted-foreground'}
        aria-label={on ? 'Volver a poner en servicio' : 'Poner fuera de servicio'}
        title={on ? 'Fuera de servicio — clic para volver a ponerlo en servicio' : 'Poner fuera de servicio (sin lecturas ni alarmas)'}>
        <Wrench className="h-3 w-3" />
      </Button>
      <ConfirmarDialog open={pedir}
        titulo={on ? `¿Volver a poner ${nombre} en servicio?` : `¿Poner ${nombre} fuera de servicio?`}
        mensaje={on ? 'Vuelve a leerse y a generar alarmas.' : 'Sigue en pantalla en gris, sin lecturas ni alarmas.'}
        textoConfirmar={on ? 'EN SERVICIO' : 'FUERA DE SERVICIO'}
        onConfirmar={() => { setPedir(false); onCambiar() }} onCancelar={() => setPedir(false)} />
    </>
  )
}

function stateBadge(c: CampoConfig, st?: CampoState) {
  if (c.enabled === false) return <Badge variant="secondary">Desactivado</Badge>
  if (c.fueraServicio) return <Badge variant="outline">Fuera de servicio</Badge>
  if (st?.license === 'excedido') return <Badge variant="warning">Fuera de licencia</Badge>
  if (!st) return <Badge variant="secondary">Sin datos</Badge>
  if (!st.online && st.sinEnlace) return <SinEnlaceBadge name={st.sinEnlace} />
  return st.online ? <Badge variant="success">ONLINE</Badge> : <Badge variant="destructive">OFFLINE</Badge>
}

export function CampoSection({ kind }: { kind: CampoKind }) {
  const store = useConfigStore()
  const cfg = store.config!
  const hasModule = useLicense(l => l.hasModule(MODULO[kind]))
  const tipo = LISTA[kind]
  const fullB = useLicense(l => l.full(tipo))
  const limitMsg = useLicense(l => l.limitMsg(tipo))
  const campo = useDrivesStore(s => s.campo)
  const [guardando, correr] = useGuardando()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [modelos, setModelos] = useState<Modelos>({})
  const [form, setForm] = useState<CampoConfig | null>(null)
  const [orig, setOrig] = useState<string | null>(null)  // null = nuevo

  useEffect(() => {
    if (!hasModule) return
    authFetch(`${API_BASE}/modelos`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setModelos).catch(() => { /* sin modelos: se edita el mapa a mano */ })
  }, [hasModule])
  if (!hasModule) return null

  const list: CampoConfig[] = cfg[tipo] || []
  const defMapa = (modelo: string): Punto[] => structuredClone(modelos[modeloId(kind, modelo)]?.mapa ?? [])
  const nuevo = (): CampoConfig => ({
    name: '', modelo: MODELOS_UI[kind][0][0], ip: '', port: 502, unitId: 1, enabled: true,
    ...(kind === 'reg' ? { tapMin: -16, tapMax: 16 } : {}), mapa: defMapa(MODELOS_UI[kind][0][0]),
  })
  // Guarda solo el equipo `name` de esta lista (sobre la config vigente)
  const conEquipo = (name: string, f: (c: CampoConfig) => CampoConfig) =>
    store.guardar(c => ({ ...c, [tipo]: editarEquipo(c[tipo], name, f) }))

  async function saveForm() {
    if (!form) return
    const name = form.name.trim()
    if (!name) { toast.error('Nombre obligatorio'); return }
    if (!form.ip.trim()) { toast.error('IP obligatoria'); return }
    // el nombre es único entre los equipos de campo (identifica al equipo en el estado en vivo)
    const otros = [...(cfg.reconectadores || []), ...(cfg.reguladores || []), ...(cfg.generadores || [])]
    if (otros.some(c => c.name === name && c.name !== orig)) { toast.error('Ya existe un equipo con ese nombre'); return }
    const banco = form.banco?.trim() || undefined
    if (kind === 'reg' && banco && list.filter(x => x.banco === banco && x.name !== orig).length >= 3) { toast.error(`El banco ${banco} ya tiene 3 reguladores`); return }
    const eq = { ...form, name, ip: form.ip.trim(), banco }
    if (await store.guardar(c => ({ ...c, [tipo]: guardarEquipo(c[tipo], orig, eq) }))) {
      toast.success(orig === null ? `${SINGULAR[kind]} agregado` : `${SINGULAR[kind]} actualizado`)
      setForm(null)
    }
  }

  const pedirBorrar = (name: string) => setPedido(pedidoBorrar(name, async () => {
    if (await store.guardar(c => ({ ...c, [tipo]: (c[tipo] || []).filter(x => x.name !== name) }))) toast.success(`${name} eliminado`)
  }))
  const pedirEnabled = (x: CampoConfig) => setPedido(pedidoHabilitar(x.name, x.enabled !== false,
    () => conEquipo(x.name, y => ({ ...y, enabled: x.enabled === false }))))
  const toggleFS = (x: CampoConfig) => {
    const fs = !x.fueraServicio
    void correr(() => conEquipo(x.name, y => ({ ...y, fueraServicio: fs || undefined })))
  }

  // Cambiar modelo: copia el mapa del nuevo. El protocolo/puerto/outstation vienen del modelo; con Modbus se quitan protocolo y dnp3
  const conModelo = (f: CampoConfig, modelo: string): CampoConfig => {
    const m = modelos[modeloId(kind, modelo)]
    const { protocolo: _p, dnp3: _d, ...base } = f
    return { ...base, modelo, mapa: defMapa(modelo), port: m?.port ?? (f.protocolo === 'dnp3' ? 502 : f.port ?? 502),
      ...(m?.protocolo === 'dnp3' ? { protocolo: 'dnp3', dnp3: { ...m.dnp3! }, unitId: undefined } : { unitId: f.unitId ?? 1 }) }
  }
  // Si el mapa actual fue editado, pide confirmar antes de reemplazarlo
  function cambiarModelo(modelo: string) {
    if (!form) return
    if (JSON.stringify(form.mapa) === JSON.stringify(defMapa(form.modelo))) { setForm(conModelo(form, modelo)); return }
    setPedido({
      titulo: '¿Reemplazar el mapa?', mensaje: 'El mapa fue modificado. Se reemplaza por el del nuevo modelo.',
      textoConfirmar: 'REEMPLAZAR', accion: async () => setForm(f => f && conModelo(f, modelo)),
    })
  }
  const pedirRestaurar = () => setPedido({
    titulo: '¿Restaurar el mapa por defecto?', mensaje: 'Se vuelve al mapa del modelo y se pierden los cambios.',
    textoConfirmar: 'RESTAURAR', accion: async () => setForm(f => f && { ...f, mapa: defMapa(f.modelo) }),
  })

  const bancos = [...new Set(list.map(c => c.banco).filter((b): b is string => !!b))]

  return (
    <SeccionConfig titulo={`${TITULO[kind]} (${list.length})`} acciones={
      <Button size="sm" disabled={fullB} title={fullB ? limitMsg : undefined} onClick={() => { setOrig(null); setForm(nuevo()) }}>
        <Plus className="h-4 w-4" />AGREGAR {SINGULAR[kind].toUpperCase()}
      </Button>
    }>
      <Table>
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
              <TableCell><Switch checked={c.enabled !== false} disabled={guardando} aria-label={`Habilitar ${c.name}`} onCheckedChange={() => pedirEnabled(c)} /></TableCell>
              <TableCell className="font-bold text-sm">{c.name}</TableCell>
              <TableCell className="text-sm">{MODELOS_UI[kind].find(m => m[0] === c.modelo)?.[1] ?? c.modelo}</TableCell>
              <TableCell className="text-xs font-mono">{c.ip}:{c.port ?? (c.protocolo === 'dnp3' ? 20000 : 502)}</TableCell>
              <TableCell className="text-center font-mono">{c.protocolo === 'dnp3' ? '—' : c.unitId ?? 1}</TableCell>
              <TableCell className="text-center">{stateBadge(c, campo.get(c.name))}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <FueraServicioBtn on={!!c.fueraServicio} nombre={c.name} disabled={guardando} onCambiar={() => toggleFS(c)} />
                <Button size="sm" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => { setOrig(c.name); setForm(structuredClone(c)) }}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Borrar ${c.name}`} className="text-destructive hover:text-destructive" disabled={guardando} onClick={() => pedirBorrar(c.name)}><Trash2 className="h-3 w-3" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-4">{VACIO[kind]}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-5xl">
          <DialogHeader><DialogTitle>{orig === null ? `Agregar ${SINGULAR[kind].toLowerCase()}` : `Editar ${orig}`}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nombre</Label><Input value={form.name} disabled={orig !== null} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Modelo</Label>
                <Select value={form.modelo} onValueChange={cambiarModelo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELOS_UI[kind].map(([v, n]) => <SelectItem key={v} value={v}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={`grid gap-3 ${form.protocolo === 'dnp3' ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <div><Label>IP</Label><Input className="font-mono" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.10.x" /></div>
              <div><Label>Puerto</Label><Input type="number" value={form.port ?? (form.protocolo === 'dnp3' ? 20000 : 502)} onChange={(e) => setForm({ ...form, port: +e.target.value })} /></div>
              {form.protocolo === 'dnp3' ? <>
                <div><Label>Outstation</Label><Input type="number" min={0} value={form.dnp3?.outstation ?? 10} onChange={(e) => setForm({ ...form, dnp3: { maestro: 1, ...form.dnp3, outstation: +e.target.value } })} /></div>
                <div><Label>Maestro</Label><Input type="number" min={0} value={form.dnp3?.maestro ?? 1} onChange={(e) => setForm({ ...form, dnp3: { outstation: 10, ...form.dnp3, maestro: +e.target.value } })} /></div>
              </> : <div><Label>ID (Unit)</Label><Input type="number" value={form.unitId ?? 1} onChange={(e) => setForm({ ...form, unitId: +e.target.value })} /></div>}
            </div>
            {/* On/Off de un equipo existente: el interruptor de la tabla (con confirmación) */}
            {orig === null && <div className="flex items-center gap-2">
              <Switch checked={form.enabled !== false} aria-label="Habilitado" onCheckedChange={(v) => setForm({ ...form, enabled: v })} /><Label>Habilitado</Label>
            </div>}
            <div><EnlaceSelect label="Conectado por" value={form.enlace} onChange={(v) => setForm({ ...form, enlace: v })} /></div>
            {kind === 'reg' && <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={form.banco ?? ''} placeholder="Sin banco (p. ej. RUA-01 Tapelectro)"
                onChange={(e) => setForm({ ...form, banco: e.target.value || undefined })} />
              {bancos.length > 0 && <div className="flex flex-wrap gap-1">
                {bancos.map(b => <Button key={b} variant="outline" size="sm" className="normal-case tracking-normal font-normal" onClick={() => setForm({ ...form, banco: b })}>{b}</Button>)}
              </div>}
              <p className="text-xs text-muted-foreground">Agrupa hasta 3 reguladores monofásicos del mismo equipo: fases a 0°, −120° y 120° según el orden en la lista.</p>
            </div>}
            {kind === 'reg' && <div className="grid grid-cols-2 gap-3">
              <div><Label>Tap mínimo</Label><Input type="number" value={form.tapMin ?? -16} onChange={(e) => setForm({ ...form, tapMin: +e.target.value })} /></div>
              <div><Label>Tap máximo</Label><Input type="number" value={form.tapMax ?? 16} onChange={(e) => setForm({ ...form, tapMax: +e.target.value })} /></div>
            </div>}
            <MapaEditor kind={kind} protocolo={form.protocolo} mapa={form.mapa} live={orig ? campo.get(orig) : undefined}
              onChange={(mapa) => setForm({ ...form, mapa })} onRestore={pedirRestaurar} />
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
