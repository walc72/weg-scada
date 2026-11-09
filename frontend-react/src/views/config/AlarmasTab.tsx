import { useConfigStore } from '../../store/config'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Save } from 'lucide-react'
import { toast } from 'sonner'

// Umbrales que generan ALARMA en las bombas (los evalúa el poller cada ciclo:
// badge en el dashboard, panel "Alarmas activas" y aviso por correo/Telegram).
const ALARM_FIELDS: { key: string; label: string; step: string; hint?: string }[] = [
  { key: 'tempHigh', label: 'Temp. alta (°C)', step: '1', hint: 'IGBT en CFW900, SCR en SSW900' },
  { key: 'currentHigh', label: 'Corriente alta (A)', step: '1' },
  { key: 'commErrorMax', label: 'Máx. errores com.', step: '1', hint: 'Ciclos seguidos sin respuesta' },
]

export default function AlarmasTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const as: any = cfg.alarmSetpoints ?? {}
  const types = Array.from(new Set(cfg.devices.map(d => d.type))).sort()

  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  function patch(fn: (a: any) => void) {
    const next = JSON.parse(JSON.stringify(cfg.alarmSetpoints ?? { defaults: {}, overrides: {} }))
    if (!next.defaults) next.defaults = {}
    if (!next.overrides) next.overrides = {}
    fn(next)
    store.setConfig({ ...cfg, alarmSetpoints: next })
  }
  function setDefault(type: string, key: string, v: number | null) {
    patch(a => {
      if (!a.defaults[type]) a.defaults[type] = {}
      if (v === null || Number.isNaN(v)) delete a.defaults[type][key]; else a.defaults[type][key] = v
    })
  }
  function setOverride(name: string, key: string, v: number | null) {
    patch(a => {
      if (!a.overrides[name]) a.overrides[name] = {}
      if (v === null || Number.isNaN(v)) delete a.overrides[name][key]; else a.overrides[name][key] = v
      if (Object.keys(a.overrides[name]).length === 0) delete a.overrides[name]
    })
  }
  async function save() { if (await store.save()) toast.success('Alarmas guardadas') }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-widest uppercase">Alarmas de bombas</h2>
        <Button onClick={save}><Save className="h-4 w-4" />Guardar Cambios</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Cuando un valor supera su umbral, la bomba muestra <strong>ALARMA</strong> en el dashboard, aparece en
        "Alarmas activas" y, si el correo/Telegram está configurado, se envía un aviso. La temperatura es la del
        IGBT en CFW900 y la del SCR en SSW900. Un campo vacío en una bomba usa el valor por defecto de su tipo;
        sin valor = sin alarma.
      </p>

      <div className="space-y-2">
        <div className="text-sm font-medium">Valores por defecto (por tipo)</div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Tipo</th>
                {ALARM_FIELDS.map(f => <th key={f.key} className="p-2 text-center" title={f.hint}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t} className="border-b border-border/40">
                  <td className="p-2 font-bold">{t}</td>
                  {ALARM_FIELDS.map(f => (
                    <td key={f.key} className="p-1">
                      <Input type="number" step={f.step} value={as.defaults?.[t]?.[f.key] ?? ''}
                        onChange={(e) => setDefault(t, f.key, num(e.target.value))} className="h-8 text-center w-24 mx-auto" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Por bomba <span className="text-xs font-normal text-muted-foreground">(vacío = usa el valor por defecto, en gris)</span></div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Bomba</th>
                <th className="text-left p-2">Tipo</th>
                {ALARM_FIELDS.map(f => <th key={f.key} className="p-2 text-center" title={f.hint}>{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {cfg.devices.map(d => (
                <tr key={d.name} className="border-b border-border/40">
                  <td className="p-2 font-medium whitespace-nowrap">{d.name}</td>
                  <td className="p-2"><Badge variant="secondary" className="text-[10px]">{d.type}</Badge></td>
                  {ALARM_FIELDS.map(f => (
                    <td key={f.key} className="p-1">
                      <Input type="number" step={f.step} value={as.overrides?.[d.name]?.[f.key] ?? ''}
                        placeholder={as.defaults?.[d.type]?.[f.key] != null ? String(as.defaults[d.type][f.key]) : '—'}
                        onChange={(e) => setOverride(d.name, f.key, num(e.target.value))} className="h-8 text-center w-24 mx-auto" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}
