// Panel de slots de un gateway PLC: layout del scan, generador del mapa, escaneo y tabla
// de slots. Todo edita la copia del gateway (pendiente hasta GUARDAR); solo «Crear bombas»
// guarda al confirmar, y sobre el gateway ya guardado.
import { useId, useState } from 'react'
import { Plus, ScanSearch, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '../../store/config'
import { useLicense } from '../../store/license'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Campo } from '../../components/config'
import type { GatewayConfig, GatewayScanCfg, GatewaySlot } from '../../types'
import type { Pedido } from './filas'
import { EscaneoPlc, plural, subtitulo } from './GatewayEscaneo'
import { exigir } from './equipos'
import { bombasDeSlots, cantidadGen, generarSlots, scanDe, slotNuevo } from './gateways'

const CAMPOS_SCAN: Array<[keyof GatewayScanCfg, string]> = [
  ['regsPerDrive', 'Regs/drive'], ['statusBase', 'Estado base'], ['statusStride', 'Estado stride'], ['maxSlots', 'Máx slots'],
]

export function GatewaySlots({ valor, set, guardado, bloqueado, pedir }: {
  valor: GatewayConfig                                   // en edición
  set: (f: (g: GatewayConfig) => GatewayConfig) => void
  guardado: GatewayConfig                                // tal como está en la config
  bloqueado: boolean                                     // hay cambios sin guardar
  pedir: (p: Pedido) => void
}) {
  const store = useConfigStore()
  const fullB = useLicense(l => l.full('variadores'))
  const limitMsg = useLicense(l => l.limitMsg('variadores'))
  const [cantidad, setCantidad] = useState(20)
  const [despues, setDespues] = useState(true)
  const sc = scanDe(valor)
  const slots = valor.slots ?? []
  const n = cantidadGen(cantidad)
  const pendientes = bombasDeSlots(guardado, store.config!.devices).length
  const base = useId()
  const id = (s: string) => base + s

  const setScan = (k: keyof GatewayScanCfg, v: number) => set(g => ({ ...g, scan: { ...scanDe(g), [k]: v } }))
  const setSlots = (f: (s: GatewaySlot[]) => GatewaySlot[]) => set(g => ({ ...g, slots: f(g.slots ?? []) }))
  const setSlot = (i: number, patch: Partial<GatewaySlot>) => setSlots(s => s.map((x, j) => j === i ? { ...x, ...patch } : x))

  function generar() {
    const aplicar = async () => set(g => generarSlots(g, n, despues))
    if (!slots.length) { void aplicar(); return }
    pedir({
      titulo: '¿Reemplazar los slots?', textoConfirmar: 'REEMPLAZAR', accion: aplicar,
      mensaje: `Se reemplazan los ${slots.length} slots actuales por ${n} generados. Queda pendiente hasta guardar el gateway.`,
    })
  }

  function pedirCrear() {
    pedir({
      titulo: `¿Crear ${plural(pendientes, 'bomba')}?`, textoConfirmar: 'CREAR',
      mensaje: `Se agrega un drive SSW900 por cada slot de ${guardado.name} que todavía no tiene bomba.`,
      accion: async () => {
        const ok = await store.guardar(c => {
          exigir(c.gateways, guardado.name) // si lo borraron en otra pestaña no se crea nada
          const gw = c.gateways.find(g => g.name === guardado.name)!
          return { ...c, devices: [...c.devices, ...bombasDeSlots(gw, c.devices)] }
        })
        if (ok) toast.success('Bombas creadas')
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 border p-3">
        <h3 className={subtitulo}>Layout del scan (mapa %MW del PLC)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CAMPOS_SCAN.map(([k, etiqueta]) => (
            <Campo key={k} etiqueta={etiqueta} htmlFor={id(k)}>
              <Input id={id(k)} type="number" value={sc[k]} onChange={e => setScan(k, +e.target.value)} className="font-mono" />
            </Campo>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">El escaneo lee datos en <code>slot×{sc.regsPerDrive}</code> y estado en <code>{sc.statusBase}+slot×{sc.statusStride}</code>. Valores por defecto: 70/140/12/6.</p>
      </div>

      <div className="space-y-2 border p-3">
        <h3 className={subtitulo}>Generar mapa automático</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Cantidad de bombas" htmlFor={id('cant')}>
            <Input id={id('cant')} type="number" min={1} max={64} value={cantidad} onChange={e => setCantidad(+e.target.value)} className="w-24 font-mono" />
          </Campo>
          <div className="flex h-8 items-center gap-2">
            <Switch id={id('despues')} checked={despues} onCheckedChange={setDespues} />
            <Label htmlFor={id('despues')}>Estado después de los datos</Label>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={generar}><ScanSearch className="h-4 w-4" />GENERAR {n} SLOTS</Button>
            <Button size="sm" variant="outline" disabled={fullB || bloqueado || pendientes === 0}
              title={fullB ? limitMsg : bloqueado ? 'Guardá el gateway antes de crear las bombas' : undefined} onClick={pedirCrear}>
              <Plus className="h-4 w-4" />CREAR {plural(pendientes, 'BOMBA')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Crea los slots con <code>regOffset = slot×{sc.regsPerDrive}</code>{despues ? <> y <code>statusBase = {n * sc.regsPerDrive}</code></> : null} y <code>statusOffset = base + slot×{sc.statusStride}</code>, etiquetas <code>SSW 1…N</code>. Con «Estado después de los datos» no se solapan.
        </p>
      </div>

      <EscaneoPlc gw={valor} onUsar={s => setSlots(() => s)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={subtitulo}>Slots: id → offsets del PLC</h3>
          <Button size="sm" variant="outline" onClick={() => setSlots(s => [...s, slotNuevo(s)])}><Plus className="h-4 w-4" />AGREGAR SLOT</Button>
        </div>
        {slots.length === 0
          ? <p className="text-xs text-muted-foreground">Todavía no hay slots. Escaneá el gateway, generá el mapa o agregalos a mano.</p>
          : (
            <Table className="text-xs">
              <TableHeader><TableRow>
                <TableHead>ID</TableHead><TableHead>Reg offset</TableHead><TableHead>Status offset</TableHead><TableHead>Etiqueta</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {slots.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell><Input type="number" aria-label="ID" value={s.id} onChange={e => setSlot(i, { id: +e.target.value })} className="h-7 w-16 font-mono" /></TableCell>
                    <TableCell><Input type="number" aria-label="Reg offset" value={s.regOffset} onChange={e => setSlot(i, { regOffset: +e.target.value })} className="h-7 w-20 font-mono" /></TableCell>
                    <TableCell><Input type="number" aria-label="Status offset" value={s.statusOffset} onChange={e => setSlot(i, { statusOffset: +e.target.value })} className="h-7 w-20 font-mono" /></TableCell>
                    <TableCell><Input aria-label="Etiqueta" value={s.label ?? ''} onChange={e => setSlot(i, { label: e.target.value })} className="h-7 w-32" placeholder="opcional" /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" aria-label={`Quitar slot ${s.id}`} className="text-destructive hover:text-destructive"
                        onClick={() => setSlots(x => x.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </div>
    </div>
  )
}
