import { useMemo } from 'react'
import { useConfigStore } from '../../store/config'
import { Label } from '../../components/ui/label'
import { Checkbox } from '../../components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { SeccionConfig, Campo, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import { toast } from 'sonner'

// Radix Select no admite value="": centinela para "ninguno".
const NINGUNO = '__ninguno__'

// ─── Balance / Pérdida ────────────────────────────────────────────────
export default function BalanceTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const meters = cfg.meters
  const meterLabel = (m: any) => cfg.meterNames?.[m?.name] || m?.ui?.title || m?.name || ''

  const ed = useEdicion(useMemo(() => ({
    primaryMeter: cfg.primaryMeter ?? '',
    lossMeter: cfg.lossMeter,
  }), [cfg.primaryMeter, cfg.lossMeter]))
  const loss = { main: ed.valor.lossMeter?.main ?? '', subtract: ed.valor.lossMeter?.subtract || [] }

  function setMain(name: string) {
    ed.set(v => ({ ...v, lossMeter: { main: name, subtract: (v.lossMeter?.subtract || []).filter(n => n !== name) } }))
  }
  function toggleSub(name: string, on: boolean) {
    ed.set(v => {
      const set = new Set(v.lossMeter?.subtract || [])
      if (on) set.add(name); else set.delete(name)
      return { ...v, lossMeter: { main: v.lossMeter?.main ?? '', subtract: [...set] } }
    })
  }
  const [guardando, correr] = useGuardando()
  const guardar = () => correr(async () => {
    const ok = await ed.guardar(v => store.guardar(c => ({ ...c, primaryMeter: v.primaryMeter || undefined, lossMeter: v.lossMeter })))
    if (ok) toast.success('Balance guardado')
  })

  const restables = meters.filter(m => m.name !== loss.main)

  return (
    <SeccionConfig titulo="Balance / Pérdida" className="max-w-3xl">
      <div className="max-w-md border-b pb-4">
        <Campo etiqueta="Medidor principal del Dashboard" ayuda="Es el que se muestra primero (grande) en el Dashboard.">
          <Select value={ed.valor.primaryMeter || NINGUNO} onValueChange={(v) => ed.set(s => ({ ...s, primaryMeter: v === NINGUNO ? '' : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NINGUNO}>— Automático (el primero online) —</SelectItem>
              {meters.map(m => <SelectItem key={m.name} value={m.name}>{meterLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
      </div>
      <p className="text-xs text-muted-foreground">Pérdida = medidor principal − (suma de los seleccionados). Elegí cuáles restan según cómo esté la llave que desacopla las líneas.</p>

      <div className="max-w-md">
        <Campo etiqueta="Medidor principal">
          <Select value={loss.main || NINGUNO} onValueChange={(v) => setMain(v === NINGUNO ? '' : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NINGUNO}>— Seleccionar —</SelectItem>
              {meters.map(m => <SelectItem key={m.name} value={m.name}>{meterLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      <div className="space-y-1.5">
        <Label>Medidores que restan</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {restables.map(m => (
            <Label key={m.name} className="flex items-center gap-2 text-sm normal-case tracking-normal font-normal text-foreground border rounded-sm px-3 py-2 cursor-pointer select-none">
              <Checkbox checked={loss.subtract.includes(m.name)} onCheckedChange={(on) => toggleSub(m.name, on)} />
              {meterLabel(m)}
            </Label>
          ))}
          {restables.length === 0 && (
            <span className="text-xs text-muted-foreground">No hay otros medidores.</span>
          )}
        </div>
      </div>

      {loss.main && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Fórmula: <strong>{meterLabel(meters.find(m => m.name === loss.main))}</strong>
          {loss.subtract.length
            ? ' − (' + loss.subtract.map(n => meterLabel(meters.find(m => m.name === n) || { name: n })).join(' + ') + ')'
            : ' − (nada seleccionado)'}
        </div>
      )}
      <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
    </SeccionConfig>
  )
}
