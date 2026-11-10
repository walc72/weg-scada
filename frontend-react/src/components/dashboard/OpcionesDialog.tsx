import { useState } from 'react'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Campo } from '../config'
import { useConfigStore } from '../../store/config'
import { useLicense } from '../../store/license'
import { tituloGrafico, useEquipos } from '../GraficoUsuario'
import { usePrefs } from '../../store/prefs'
import { nombreMedidor } from '@/lib/kpis'
import { CATALOGO, KPI_IDS, PERIODOS_COSTO, INDICADORES_COSTO, CAMPOS_BOMBA, COLUMNAS_CAUDAL, MAX_TITULO, type ItemGadget } from '@/lib/gadgets'
import { PERIODO_TXT } from '@/lib/costo'
import { colectorLabel } from '@/lib/flow'
import type { Gauge } from '@/lib/gauges'
import GaugesOpciones from './GaugesOpciones'

type Op = Record<string, unknown>

const KPI_LABEL: Record<typeof KPI_IDS[number], string> = {
  motores: 'MOTORES EN MARCHA', potencia: 'POTENCIA TOTAL', caudal: 'CAUDAL TOTAL', energia: 'ENERGÍA HOY',
  kwhL: 'kWh / L', frecuencia: 'FRECUENCIA RED', perdida: 'PÉRDIDA',
}
// Radix Select no admite value="": centinela para «el principal de la config»
const PRINCIPAL = '__principal__'
const filaCheck = 'flex items-center gap-2 text-sm normal-case tracking-normal font-normal text-foreground border rounded-sm px-3 py-2 cursor-pointer select-none'

const IND_TXT: Record<string, string> = { costo: 'COSTO', kwh: 'ENERGÍA kWh', porLitro: 'COSTO POR LITRO', franjas: 'DESGLOSE POR FRANJA' }
const CAMPO_TXT: Record<string, string> = { estado: 'ESTADO', corriente: 'CORRIENTE', potencia: 'POTENCIA', frecuencia: 'FRECUENCIA', horas: 'MARCHA HOY', energia: 'ENERGÍA HOY' }
const COL_TXT: Record<string, string> = { caudal: 'CAUDAL', total: 'TOTALIZADOR', estado: 'ESTADO' }
const grilla = 'grid gap-2 sm:grid-cols-2'

// Alterna k en la lista respetando el orden de `todos`; nunca la deja vacía
const alternar = (lista: string[], todos: readonly string[], k: string, on: boolean) => {
  const n = todos.filter(x => (x === k ? on : lista.includes(x)))
  return n.length ? n : lista
}

function Marca({ etiqueta, checked, onChange }: { etiqueta: string; checked: boolean; onChange: (on: boolean) => void }) {
  return <Label className={filaCheck}><Checkbox checked={checked} onCheckedChange={onChange} />{etiqueta}</Label>
}

// Varios de una lista con «TODOS» (null = todos, también los que se agreguen después). No queda vacío.
function Todos({ etiqueta, todos, elegidos, onChange, rotulo = (x: string) => x }: {
  etiqueta: string; todos: string[]; elegidos: string[] | null; onChange: (v: string[] | null) => void; rotulo?: (x: string) => string
}) {
  const alt = (x: string, on: boolean) => {
    const n = on ? [...(elegidos ?? []), x] : (elegidos ?? todos).filter(y => y !== x)
    if (n.length) onChange(n.length === todos.length ? null : n)
  }
  return (
    <Campo etiqueta={etiqueta}>
      <div className={grilla}>
        <Marca etiqueta="TODOS" checked={elegidos === null} onChange={on => { if (on) onChange(null) }} />
        {todos.map(x => <Marca key={x} etiqueta={rotulo(x)} checked={elegidos === null || elegidos.includes(x)} onChange={on => alt(x, on)} />)}
      </div>
    </Campo>
  )
}

function Elegir({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: string; opciones: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Campo etiqueta={etiqueta}>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{opciones.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}</SelectContent>
      </Select>
    </Campo>
  )
}

// Opciones de un gadget. «APLICAR» cambia el layout en edición; se guarda recién con GUARDAR.
// Montar con `key={item.id}` para que el borrador arranque de las opciones del gadget.
export default function OpcionesDialog({ item, sitios, onAplicar, onCancelar }: {
  item: ItemGadget | null; sitios: string[]; onAplicar: (o: Op) => void; onCancelar: () => void
}) {
  const [o, setO] = useState<Op>(item?.opciones ?? {})
  const config = useConfigStore(s => s.config)
  const hasCaudales = useLicense(s => s.hasModule('caudales'))
  const equipos = useEquipos()
  const graficos = usePrefs(s => s.misGraficos) ?? []
  const set = (p: Op) => setO(v => ({ ...v, ...p }))

  let cuerpo = null
  if (item?.tipo === 'kpis') {
    const ocultos = (o.ocultos as string[]) ?? []
    cuerpo = (
      <div className="grid gap-2 sm:grid-cols-2">
        {KPI_IDS.map(k => <Marca key={k} etiqueta={KPI_LABEL[k]} checked={!ocultos.includes(k)}
          onChange={on => set({ ocultos: on ? ocultos.filter(x => x !== k) : [...ocultos, k] })} />)}
      </div>
    )
  } else if (item?.tipo === 'bombas') {
    cuerpo = sitios.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay sitios configurados.</p>
      : <Todos etiqueta="Sitios" todos={sitios} elegidos={o.sitios as string[] | null} onChange={v => set({ sitios: v })} />
  } else if (item?.tipo === 'medidor') {
    cuerpo = (
      <Campo etiqueta="Medidor">
        <Select value={(o.medidor as string | null) ?? PRINCIPAL} onValueChange={v => set({ medidor: v === PRINCIPAL ? null : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={PRINCIPAL}>PRINCIPAL</SelectItem>
            {(config?.meters ?? []).map(m => <SelectItem key={m.name} value={m.name}>{nombreMedidor(config, m.name)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Campo>
    )
  } else if (item?.tipo === 'tendencia') {
    cuerpo = (
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Magnitud">
          <Select value={o.magnitud as string} onValueChange={v => set({ magnitud: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="potencia">POTENCIA</SelectItem>
              {hasCaudales && <SelectItem value="caudal">CAUDAL</SelectItem>}
            </SelectContent>
          </Select>
        </Campo>
        <Campo etiqueta="Ventana">
          <Select value={String(o.ventanaH)} onValueChange={v => set({ ventanaH: Number(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 6, 24].map(h => <SelectItem key={h} value={String(h)}>{h} H</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
      </div>
    )
  } else if (item?.tipo === 'misGrafico') {
    cuerpo = graficos.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay gráficos. Se arman en Mis gráficos.</p> : (
      <Campo etiqueta="Gráfico">
        {/* un id que ya no existe muestra el placeholder ('' en Radix) */}
        <Select value={graficos.some(g => g.id === o.grafico) ? (o.grafico as string) : ''} onValueChange={v => set({ grafico: v })}>
          <SelectTrigger><SelectValue placeholder="Elegir gráfico" /></SelectTrigger>
          <SelectContent>
            {graficos.map(g => <SelectItem key={g.id} value={g.id}>{tituloGrafico(equipos, g)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Campo>
    )
  } else if (item?.tipo === 'gauges') {
    cuerpo = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Elegir etiqueta="Estilo" valor={o.estilo as string} opciones={[['arco', 'ARCO'], ['linea', 'LÍNEA']]} onChange={v => set({ estilo: v })} />
          <Elegir etiqueta="Tamaño" valor={o.tamano as string} opciones={[['S', 'S'], ['M', 'M'], ['L', 'L']]} onChange={v => set({ tamano: v })} />
        </div>
        <GaugesOpciones gauges={(o.gauges as Gauge[]) ?? []} onChange={gauges => set({ gauges })} />
      </div>
    )
  } else if (item?.tipo === 'costo') {
    const per = o.periodos as string[], ind = o.indicadores as string[]
    cuerpo = (
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Períodos">
          <div className={grilla}>{PERIODOS_COSTO.map(p => <Marca key={p} etiqueta={PERIODO_TXT[p]} checked={per.includes(p)} onChange={on => set({ periodos: alternar(per, PERIODOS_COSTO, p, on) })} />)}</div>
        </Campo>
        <Campo etiqueta="Indicadores">
          <div className={grilla}>{INDICADORES_COSTO.map(k => <Marca key={k} etiqueta={IND_TXT[k]} checked={ind.includes(k)} onChange={on => set({ indicadores: alternar(ind, INDICADORES_COSTO, k, on) })} />)}</div>
        </Campo>
        {sitios.length > 0 && <Todos etiqueta="Sitios" todos={sitios} elegidos={o.sitios as string[] | null} onChange={v => set({ sitios: v })} />}
      </div>
    )
  } else if (item?.tipo === 'bomba') {
    const devs = config?.devices ?? []
    const campos = o.campos as string[]
    cuerpo = devs.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay bombas configuradas.</p> : (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Bomba">
            {/* una bomba que ya no existe muestra el placeholder */}
            <Select value={devs.some(d => d.name === o.bomba) ? (o.bomba as string) : ''} onValueChange={v => set({ bomba: v })}>
              <SelectTrigger><SelectValue placeholder="Elegir bomba" /></SelectTrigger>
              <SelectContent>{devs.map(d => <SelectItem key={d.name} value={d.name}>{d.name}{d.site ? ` · ${d.site}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Elegir etiqueta="Vista" valor={o.vista as string} opciones={[['completa', 'TARJETA COMPLETA'], ['compacta', 'COMPACTA']]} onChange={v => set({ vista: v })} />
        </div>
        {o.vista === 'compacta' && (
          <Campo etiqueta="Valores">
            <div className={grilla}>{CAMPOS_BOMBA.map(k => <Marca key={k} etiqueta={CAMPO_TXT[k]} checked={campos.includes(k)} onChange={on => set({ campos: alternar(campos, CAMPOS_BOMBA, k, on) })} />)}</div>
          </Campo>
        )}
      </div>
    )
  } else if (item?.tipo === 'caudales') {
    const fms = (config?.flowmeters ?? []).filter(f => f.enabled !== false)
    const cols = o.columnas as string[]
    const rot = (n: string) => { const f = fms.find(x => x.name === n); return f && f.bombas.length > 1 ? colectorLabel(n) : n }
    cuerpo = (
      <div className="flex flex-col gap-4">
        {fms.length > 0 && <Todos etiqueta="Caudalímetros" todos={fms.map(f => f.name)} elegidos={o.caudalimetros as string[] | null} onChange={v => set({ caudalimetros: v })} rotulo={rot} />}
        <Campo etiqueta="Columnas">
          <div className={grilla}>{COLUMNAS_CAUDAL.map(k => <Marca key={k} etiqueta={COL_TXT[k]} checked={cols.includes(k)} onChange={on => set({ columnas: alternar(cols, COLUMNAS_CAUDAL, k, on) })} />)}</div>
        </Campo>
        <Elegir etiqueta="Unidad de caudal" valor={o.unidad as string} opciones={[['lps', 'L/s'], ['m3h', 'm³/h']]} onChange={v => set({ unidad: v })} />
      </div>
    )
  }

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onCancelar() }}>
      <DialogContent className={`${item?.tipo === 'gauges' ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Opciones · {item ? CATALOGO[item.tipo].titulo : ''}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Título" ayuda="Vacío = el título de fábrica." htmlFor="gadget-titulo">
            <Input id="gadget-titulo" value={(o.titulo as string) ?? ''} maxLength={MAX_TITULO} placeholder={item ? CATALOGO[item.tipo].titulo : ''} onChange={e => set({ titulo: e.target.value })} />
          </Campo>
          {cuerpo}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>CANCELAR</Button>
          <Button onClick={() => onAplicar(o)}>APLICAR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
