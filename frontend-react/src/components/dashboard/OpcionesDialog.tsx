import { useState } from 'react'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Campo } from '../config'
import { useConfigStore } from '../../store/config'
import { useLicense } from '../../store/license'
import { tituloGrafico, useEquipos } from '../GraficoUsuario'
import { usePrefs } from '../../store/prefs'
import { nombreMedidor } from '@/lib/kpis'
import { CATALOGO, KPI_IDS, type ItemGadget } from '@/lib/gadgets'
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

function Marca({ etiqueta, checked, onChange }: { etiqueta: string; checked: boolean; onChange: (on: boolean) => void }) {
  return <Label className={filaCheck}><Checkbox checked={checked} onCheckedChange={onChange} />{etiqueta}</Label>
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
    // null = todos. No se puede quedar sin ninguno: destildar el último no hace nada.
    const elegidos = o.sitios as string[] | null
    const alternar = (s: string, on: boolean) => {
      const n = on ? [...(elegidos ?? []), s] : (elegidos ?? sitios).filter(x => x !== s)
      if (n.length) set({ sitios: n.length === sitios.length ? null : n })
    }
    cuerpo = sitios.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay sitios configurados.</p> : (
      <div className="grid gap-2 sm:grid-cols-2">
        <Marca etiqueta="TODOS" checked={elegidos === null} onChange={on => { if (on) set({ sitios: null }) }} />
        {sitios.map(s => <Marca key={s} etiqueta={s} checked={elegidos === null || elegidos.includes(s)} onChange={on => alternar(s, on)} />)}
      </div>
    )
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
    cuerpo = <GaugesOpciones gauges={(o.gauges as Gauge[]) ?? []} onChange={gauges => set({ gauges })} />
  }

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onCancelar() }}>
      <DialogContent className={item?.tipo === 'gauges' ? 'max-w-3xl' : 'max-w-lg'} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Opciones · {item ? CATALOGO[item.tipo].titulo : ''}</DialogTitle>
        </DialogHeader>
        {cuerpo}
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>CANCELAR</Button>
          <Button onClick={() => onAplicar(o)}>APLICAR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
