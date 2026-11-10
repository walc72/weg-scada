// Editor de la lista de gauges del gadget: equipo + variable y, opcional, escala y límites.
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { useEquipos } from '../GraficoUsuario'
import { VARIABLES, TIPO, type Src } from '@/lib/misGraficos'
import { MAX_GAUGES, type Gauge } from '@/lib/gauges'

const LIMITES = [['min', 'Mín.'], ['max', 'Máx.'], ['alerta', 'Alerta'], ['alarma', 'Alarma']] as const

export default function GaugesOpciones({ gauges, onChange }: { gauges: Gauge[]; onChange: (g: Gauge[]) => void }) {
  const equipos = useEquipos()
  const srcs = (Object.keys(VARIABLES) as Src[]).filter(s => equipos[s].length > 0)
  const nuevo = (src: Src): Gauge => ({ src, name: equipos[src][0]?.name ?? '', field: VARIABLES[src][0].field })
  const set = (i: number, g: Gauge) => onChange(gauges.map((x, j) => (j === i ? g : x)))
  const mover = (i: number, d: number) => {
    const n = [...gauges]; n.splice(i + d, 0, n.splice(i, 1)[0]); onChange(n)
  }

  if (srcs.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay equipos configurados.</p>
  return (
    <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
      {gauges.length === 0 && <p className="text-sm text-muted-foreground">Sin variables todavía.</p>}
      {gauges.map((g, i) => (
        <div key={i} className="border rounded-sm p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground w-5">{i + 1}</span>
            <Select value={g.src} onValueChange={v => set(i, nuevo(v as Src))}>
              <SelectTrigger aria-label="Tipo de equipo" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{srcs.map(s => <SelectItem key={s} value={s}>{TIPO[s].toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={equipos[g.src].some(e => e.name === g.name) ? g.name : ''} onValueChange={v => set(i, { ...g, name: v })}>
              <SelectTrigger aria-label="Equipo" className="flex-1 min-w-0"><SelectValue placeholder="Equipo inexistente" /></SelectTrigger>
              <SelectContent>{equipos[g.src].map(e => <SelectItem key={e.name} value={e.name}>{e.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="ghost" size="icon" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Bajar" disabled={i === gauges.length - 1} onClick={() => mover(i, 1)}><ChevronDown className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => onChange(gauges.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pl-7">
            {/* cambiar de variable borra la escala propia: era de otra magnitud */}
            <Select value={g.field} onValueChange={v => set(i, { src: g.src, name: g.name, field: v })}>
              <SelectTrigger aria-label="Variable" className="col-span-2 sm:col-span-1"><SelectValue /></SelectTrigger>
              <SelectContent>{VARIABLES[g.src].map(v => <SelectItem key={v.field} value={v.field}>{v.label}{v.unit ? ` (${v.unit})` : ''}</SelectItem>)}</SelectContent>
            </Select>
            {LIMITES.map(([k, etq]) => (
              <Input key={k} type="number" aria-label={etq} placeholder={etq} className="font-mono" value={g[k] ?? ''}
                onChange={e => {
                  const n = { ...g }
                  if (e.target.value === '' || !Number.isFinite(+e.target.value)) delete n[k]; else n[k] = +e.target.value
                  set(i, n)
                }} />
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Vacíos = escala por defecto (la de Configuración para bombas y medidores). Alerta mayor que alarma = bajo es malo.</p>
      <Button variant="outline" className="self-start" disabled={gauges.length >= MAX_GAUGES} onClick={() => onChange([...gauges, nuevo(srcs[0])])}>
        <Plus className="h-4 w-4" />AGREGAR VARIABLE
      </Button>
    </div>
  )
}
