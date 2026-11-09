import { useState } from 'react'
import { Pencil, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '../../store/config'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import type { DeviceConfig, NominalConfig } from '../../types'

const CAMPOS: { k: keyof NominalConfig; label: string; unidad: string }[] = [
  { k: 'corriente', label: 'Corriente nominal', unidad: 'A' },
  { k: 'tension', label: 'Tensión nominal', unidad: 'V' },
  { k: 'frecuencia', label: 'Frecuencia nominal', unidad: 'Hz' },
  { k: 'potencia', label: 'Potencia nominal', unidad: 'kW' },
]
const num = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 })

// Celda "Nominales" de la tabla de bombas + diálogo: datos de placa del motor, cargados a mano
// (el equipo no los informa). Campo vacío = sin dato.
export function PumpNominalCell({ dev }: { dev: DeviceConfig }) {
  const store = useConfigStore()
  const cfg = store.config!
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const n = dev.nominal ?? {}
  const resumen = [n.corriente != null && `${num(n.corriente)} A`, n.tension != null && `${num(n.tension)} V`, n.potencia != null && `${num(n.potencia)} kW`].filter(Boolean).join(' · ')

  async function save() {
    if (!form) return
    const nominal: NominalConfig = {}
    for (const { k, label } of CAMPOS) {
      const t = (form[k] ?? '').trim().replace(',', '.')
      if (!t) continue
      const v = Number(t)
      if (!Number.isFinite(v) || v <= 0) { toast.error(`${label}: número mayor a 0`); return }
      nominal[k] = v
    }
    const devices = cfg.devices.map(d => {
      if (d.name !== dev.name) return d
      const { nominal: _old, ...rest } = d
      return Object.keys(nominal).length ? { ...rest, nominal } : rest
    })
    store.setConfig({ ...cfg, devices })
    if (await store.save()) { toast.success('Datos nominales guardados'); setForm(null) }
  }

  return (
    <>
      <button className="inline-flex items-center gap-1 px-1.5 min-h-[26px] text-xs hover:bg-accent text-left disabled:opacity-60" title="Cargar datos nominales del motor"
        onClick={() => setForm(Object.fromEntries(CAMPOS.map(({ k }) => [k, n[k] != null ? String(n[k]) : ''])))}>
        <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
        {resumen || <span className="text-muted-foreground">Sin cargar</span>}
      </button>
      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Datos nominales — {dev.name}</DialogTitle></DialogHeader>
          {form && <div className="grid grid-cols-2 gap-3">
            {CAMPOS.filter(c => c.k !== 'frecuencia' || dev.type !== 'SSW900').map(({ k, label, unidad }) => (
              <div key={k}>
                <Label>{label} ({unidad})</Label>
                <Input inputMode="decimal" value={form[k]} placeholder="sin dato" onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <p className="col-span-2 text-xs text-muted-foreground">De la placa del motor. Se muestran en el detalle del motor; los campos vacíos quedan sin dato.</p>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={save}><Save className="h-4 w-4" />Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
