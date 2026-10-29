// Editor del mapa de registros de un reconectador / regulador (spec §6.2).
// Tabla editable por punto, con el valor en vivo al lado para validar contra el equipo.
import { useRef } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import type { CampoState, Punto } from '../types'

const KEYS = {
  reco: ['estado', 'ia', 'ib', 'ic', 'va', 'vb', 'vc', 'bloqueo', 'disparo', 'operaciones', 'med', 'senal', 'alarma', 'comOk'],
  reg: ['tap', 'v', 'i', 'vConsigna', 'auto', 'remoto', 'med', 'senal', 'alarma', 'comOk'],
}
const TIPOS = ['u16', 's16', 'u32', 's32', 'f32', 'bool']
const ROLES = ['angulo', 'fp', 'kw', 'kvar']
const ETIQUETA: Record<string, string> = { comOk: 'comOk (comunicación del equipo de campo)', med: 'med (medición libre)', senal: 'senal (señal sí/no)' }
const SEL = 'h-8 w-full rounded-md border border-input bg-background px-1 text-sm'
const IN = 'h-8 px-2 text-sm'

export function MapaEditor({ kind, mapa, onChange, live, onRestore }: {
  kind: 'reco' | 'reg'; mapa: Punto[]; onChange: (m: Punto[]) => void
  live?: CampoState; onRestore: () => void
}) {
  // Mapa tal como se cargó al abrir: base para avisar renombres (el histórico queda con el nombre anterior)
  // Se indexa por fc:addr (no por fila): borrar/insertar filas no desplaza el aviso
  const inicial = useRef(new Map(mapa.filter(x => x.nombre).map(x => [`${x.fc}:${x.addr}`, x.nombre]))).current
  const set = (i: number, p: Partial<Punto>) => onChange(mapa.map((x, j) => j === i ? { ...x, ...p } : x))
  // Campo opcional numérico: vacío = se quita
  const opt = (i: number, k: 'escala' | 'bit' | 'valor', v: string) => {
    const { [k]: _old, ...rest } = mapa[i]
    onChange(mapa.map((x, j) => j === i ? (v === '' ? rest : { ...rest, [k]: +v }) as Punto : x))
  }
  // Campos de puntos libres: vacío/false = se quita; decimales siempre número
  const optLibre = (i: number, k: 'nombre' | 'unidad' | 'rol' | 'decimales' | 'principal', v: string | boolean) => {
    const { [k]: _old, ...rest } = mapa[i]
    const val = v === '' || v === false ? undefined : k === 'decimales' ? +v : v
    onChange(mapa.map((x, j) => j === i ? (val === undefined ? rest : { ...rest, [k]: val }) as Punto : x))
  }
  // Cambio de key: se descartan los campos que la nueva key no usa
  const cambiaKey = (i: number, key: string) => onChange(mapa.map((x, j) => {
    if (j !== i) return x
    const { nombre: _n, unidad: _u, decimales: _d, principal: _p, rol: _r, ...base } = x
    if (key === 'med') { const { bit: _b, valor: _v, ...m } = x; return { ...m, key, ...(m.tipo === 'bool' ? { tipo: 'u16', fc: 3 } : {}) } as Punto }
    if (key === 'senal') { const { unidad: _u2, decimales: _d2, rol: _r2, ...s } = x; return { ...s, key } as Punto }
    return { ...base, key } as Punto
  }))
  const libre = (p: Punto) => p.key === 'med' || p.key === 'senal'
  // bool (fc 1/2) no admite bit, valor, escala ni orden: se limpian
  const soloBool = (x: Punto): Punto => { const { bit: _b, valor: _v, escala: _e, orden: _o, ...rest } = x; return rest }
  const cambiaTipo = (i: number, tipo: string) => onChange(mapa.map((x, j) => j !== i ? x
    : tipo === 'bool' ? { ...soloBool(x), tipo, fc: x.fc < 3 ? x.fc : 1 } as Punto : { ...x, tipo, fc: x.fc < 3 ? 3 : x.fc } as Punto))
  const cambiaFc = (i: number, fc: 1 | 2 | 3 | 4) => onChange(mapa.map((x, j) => j !== i ? x
    : fc < 3 ? { ...soloBool(x), fc, tipo: 'bool' } : { ...x, fc, tipo: x.tipo === 'bool' ? 'u16' : x.tipo }))
  const vivo = (p: Punto, i: number) => {
    if (!live) return '-'
    if (p.key === 'med') { const v = p.nombre ? live.extras?.[p.nombre] : null; return v == null ? '-' : String(v) + (p.unidad ? ' ' + p.unidad : '') }
    if (p.key === 'senal') { const v = p.nombre ? live.senales?.[p.nombre] : null; return v == null ? '-' : v ? 'Sí' : 'No' }
    if (p.key === 'alarma') return live?.alarmas?.['ALARMA_' + i] ? 'Activa' : '-'
    const v = live?.valores?.[p.key]
    return v == null ? '-' : String(v)
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Mapa de registros ({mapa.length})</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onRestore}><RotateCcw className="h-3 w-3" />Restaurar mapa por defecto</Button>
          <Button size="sm" variant="outline" onClick={() => onChange([...mapa, { key: KEYS[kind][0], fc: 3, addr: 0, tipo: 'u16' }])}><Plus className="h-3 w-3" />Punto</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Dirección base 0: 0 = 40001 (fc 3) / 30001 (fc 4); fc 1/2 (coils / entradas discretas) usan tipo bool. «bit» (0–15) o «valor» solo con u16/s16.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-1">Key</th><th className="px-1">fc</th><th className="px-1">Dirección</th><th className="px-1">Tipo</th>
              <th className="px-1">Orden</th><th className="px-1">Escala</th><th className="px-1">Bit</th><th className="px-1">Valor</th>
              <th className="px-1">Nombre</th><th className="px-1">Unidad</th><th className="px-1">Dec.</th><th className="px-1">Principal</th><th className="px-1">Rol</th>
              <th className="px-1">Texto</th><th className="px-1">En vivo</th><th />
            </tr>
          </thead>
          <tbody>
            {mapa.map((p, i) => (
              <tr key={i}>
                <td className="p-1 min-w-24"><select className={SEL} value={p.key} onChange={(e) => cambiaKey(i, e.target.value)}>
                  {KEYS[kind].map(k => <option key={k} value={k}>{ETIQUETA[k] ?? k}</option>)}</select></td>
                <td className="p-1 w-16"><select className={SEL} value={p.fc} onChange={(e) => cambiaFc(i, +e.target.value as 1 | 2 | 3 | 4)}>
                  <option value={1}>1 (coils)</option><option value={2}>2 (entradas discretas)</option><option value={3}>3</option><option value={4}>4</option></select></td>
                <td className="p-1 w-24"><Input className={IN} type="number" min={0} title="base 0: 0 = 40001" value={p.addr} onChange={(e) => set(i, { addr: +e.target.value })} /></td>
                <td className="p-1 w-20"><select className={SEL} value={p.tipo} onChange={(e) => cambiaTipo(i, e.target.value)}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></td>
                <td className="p-1 w-20"><select className={SEL} disabled={p.tipo === 'bool'} value={p.orden ?? ''} onChange={(e) => { const { orden: _o, ...rest } = p; onChange(mapa.map((x, j) => j === i ? (e.target.value ? { ...rest, orden: e.target.value } : rest) : x)) }}>
                  <option value="">—</option><option value="BE">BE</option><option value="LE">LE</option></select></td>
                <td className="p-1 w-20"><Input className={IN} disabled={p.tipo === 'bool'} type="number" step="any" value={p.escala ?? ''} onChange={(e) => opt(i, 'escala', e.target.value)} /></td>
                <td className="p-1 w-16"><Input className={IN} disabled={p.tipo === 'bool'} type="number" min={0} max={15} value={p.bit ?? ''} onChange={(e) => opt(i, 'bit', e.target.value)} /></td>
                <td className="p-1 w-20"><Input className={IN} disabled={p.tipo === 'bool'} type="number" step={1} value={p.valor ?? ''} onChange={(e) => opt(i, 'valor', e.target.value)} /></td>
                <td className="p-1 min-w-28">{libre(p) && <Input className={IN} maxLength={40} value={p.nombre ?? ''} onChange={(e) => optLibre(i, 'nombre', e.target.value)} />}
                  {libre(p) && inicial.has(`${p.fc}:${p.addr}`) && p.nombre !== inicial.get(`${p.fc}:${p.addr}`) && <div className="text-xs text-amber-600">el histórico sigue con el nombre anterior</div>}</td>
                <td className="p-1 w-16">{p.key === 'med' && <Input className={IN} maxLength={10} value={p.unidad ?? ''} onChange={(e) => optLibre(i, 'unidad', e.target.value)} />}</td>
                <td className="p-1 w-16">{p.key === 'med' && <Input className={IN} type="number" min={0} max={3} step={1} value={p.decimales ?? ''} onChange={(e) => optLibre(i, 'decimales', e.target.value)} />}</td>
                <td className="p-1 w-16 text-center">{libre(p) && <input type="checkbox" checked={!!p.principal} onChange={(e) => optLibre(i, 'principal', e.target.checked)} />}</td>
                <td className="p-1 w-24">{p.key === 'med' && <select className={SEL} value={p.rol ?? ''} onChange={(e) => optLibre(i, 'rol', e.target.value)}>
                  <option value="">—</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>}</td>
                <td className="p-1 min-w-28"><Input className={IN} value={p.texto ?? ''} onChange={(e) => { const { texto: _t, ...rest } = p; onChange(mapa.map((x, j) => j === i ? (e.target.value ? { ...rest, texto: e.target.value } : rest) : x)) }} /></td>
                <td className="p-1 tabular-nums whitespace-nowrap">{vivo(p, i)}</td>
                <td className="p-1"><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onChange(mapa.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
