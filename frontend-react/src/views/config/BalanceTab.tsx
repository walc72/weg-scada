import { useConfigStore } from '../../store/config'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Save } from 'lucide-react'
import { toast } from 'sonner'

// ─── Balance / Pérdida ────────────────────────────────────────────────
export default function BalanceTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const meters = cfg.meters
  const loss = cfg.lossMeter ?? { main: '', subtract: [] }
  const meterLabel = (m: any) => (cfg as any).meterNames?.[m?.name] || m?.ui?.title || m?.name || ''

  function setMain(name: string) {
    const subtract = (loss.subtract || []).filter(n => n !== name)
    store.setConfig({ ...cfg, lossMeter: { main: name, subtract } })
  }
  function toggleSub(name: string, on: boolean) {
    const set = new Set(loss.subtract || [])
    if (on) set.add(name); else set.delete(name)
    store.setConfig({ ...cfg, lossMeter: { main: loss.main, subtract: [...set] } })
  }
  function setPrimary(name: string) {
    store.setConfig({ ...cfg, primaryMeter: name || undefined })
  }
  async function save() { if (await store.save()) toast.success('Balance guardado') }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-widest uppercase">Balance / Pérdida</h2>
        <Button onClick={save}><Save className="h-4 w-4" />Guardar Cambios</Button>
      </div>

      <div className="space-y-2 max-w-md border-b pb-4">
        <label className="text-sm font-medium">Medidor principal del Dashboard</label>
        <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={cfg.primaryMeter ?? ''} onChange={(e) => setPrimary(e.target.value)}>
          <option value="">— Automático (el primero online) —</option>
          {meters.map(m => <option key={m.name} value={m.name}>{meterLabel(m)}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Es el que se muestra primero (grande) en el Dashboard.</p>
      </div>
      <p className="text-sm text-muted-foreground">Pérdida = medidor principal − (suma de los seleccionados). Elegí cuáles restan según cómo esté la llave que desacopla las líneas.</p>

      <div className="space-y-2 max-w-md">
        <label className="text-sm font-medium">Medidor principal</label>
        <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={loss.main} onChange={(e) => setMain(e.target.value)}>
          <option value="">— Seleccionar —</option>
          {meters.map(m => <option key={m.name} value={m.name}>{meterLabel(m)}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Medidores que restan</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {meters.filter(m => m.name !== loss.main).map(m => (
            <label key={m.name} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer select-none">
              <input type="checkbox" checked={(loss.subtract || []).includes(m.name)} onChange={(e) => toggleSub(m.name, e.target.checked)} />
              {meterLabel(m)}
            </label>
          ))}
          {meters.filter(m => m.name !== loss.main).length === 0 && (
            <span className="text-xs text-muted-foreground">No hay otros medidores.</span>
          )}
        </div>
      </div>

      {loss.main && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Fórmula: <strong>{meterLabel(meters.find(m => m.name === loss.main))}</strong>
          {(loss.subtract || []).length
            ? ' − (' + (loss.subtract || []).map(n => meterLabel(meters.find(m => m.name === n) || { name: n })).join(' + ') + ')'
            : ' − (nada seleccionado)'}
        </div>
      )}
    </Card>
  )
}
