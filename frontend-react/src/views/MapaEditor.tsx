// Editor del mapa de registros de un reconectador / regulador (spec §6.2).
// Tabla editable por punto, con el valor en vivo al lado para validar contra el equipo.
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import type { CampoState, Punto } from '../types'

const KEYS = {
  reco: ['estado', 'ia', 'ib', 'ic', 'va', 'vb', 'vc', 'bloqueo', 'disparo', 'operaciones', 'alarma', 'comOk'],
  reg: ['tap', 'v', 'i', 'vConsigna', 'auto', 'remoto', 'alarma', 'comOk'],
}
const TIPOS = ['u16', 's16', 'u32', 's32', 'f32', 'bool']
const ETIQUETA: Record<string, string> = { comOk: 'comOk (comunicación del equipo de campo)' }
const SEL = 'h-8 w-full rounded-md border border-input bg-background px-1 text-sm'
const IN = 'h-8 px-2 text-sm'

export function MapaEditor({ kind, mapa, onChange, live, onRestore }: {
  kind: 'reco' | 'reg'; mapa: Punto[]; onChange: (m: Punto[]) => void
  live?: CampoState; onRestore: () => void
}) {
  const set = (i: number, p: Partial<Punto>) => onChange(mapa.map((x, j) => j === i ? { ...x, ...p } : x))
  // Campo opcional numérico: vacío = se quita
  const opt = (i: number, k: 'escala' | 'bit' | 'valor', v: string) => {
    const { [k]: _old, ...rest } = mapa[i]
    onChange(mapa.map((x, j) => j === i ? (v === '' ? rest : { ...rest, [k]: +v }) as Punto : x))
  }
  // bool (fc 1/2) no admite bit, valor, escala ni orden: se limpian
  const soloBool = (x: Punto): Punto => { const { bit: _b, valor: _v, escala: _e, orden: _o, ...rest } = x; return rest }
  const cambiaTipo = (i: number, tipo: string) => onChange(mapa.map((x, j) => j !== i ? x
    : tipo === 'bool' ? { ...soloBool(x), tipo, fc: x.fc < 3 ? x.fc : 1 } as Punto : { ...x, tipo, fc: x.fc < 3 ? 3 : x.fc } as Punto))
  const cambiaFc = (i: number, fc: 1 | 2 | 3 | 4) => onChange(mapa.map((x, j) => j !== i ? x
    : fc < 3 ? { ...soloBool(x), fc, tipo: 'bool' } : { ...x, fc, tipo: x.tipo === 'bool' ? 'u16' : x.tipo }))
  const vivo = (p: Punto, i: number) => {
    if (!live) return '-'
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
              <th className="px-1">Texto</th><th className="px-1">En vivo</th><th />
            </tr>
          </thead>
          <tbody>
            {mapa.map((p, i) => (
              <tr key={i}>
                <td className="p-1 min-w-24"><select className={SEL} value={p.key} onChange={(e) => set(i, { key: e.target.value })}>
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
