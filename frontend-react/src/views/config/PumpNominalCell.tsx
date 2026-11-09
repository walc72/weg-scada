import { useState } from 'react'
import { Pencil, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '../../store/config'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { useGuardando } from '../../components/config'
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
  const guardar = useConfigStore(s => s.guardar)
  const [guardando, correr] = useGuardando()
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
    const ok = await guardar(c => ({
      ...c,
      devices: c.devices.map(d => {
        if (d.name !== dev.name) return d
        const { nominal: _old, ...rest } = d
        return Object.keys(nominal).length ? { ...rest, nominal } : rest
      }),
    }))
    if (ok) { toast.success('Datos nominales guardados'); setForm(null) }
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-auto min-h-[26px] gap-1 px-1.5 text-left font-normal normal-case tracking-normal" title="Cargar datos nominales del motor"
        onClick={() => setForm(Object.fromEntries(CAMPOS.map(({ k }) => [k, n[k] != null ? String(n[k]) : ''])))}>
        <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
        {resumen || <span className="text-muted-foreground">Sin cargar</span>}
      </Button>
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
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={() => correr(save)} disabled={guardando}><Save className="h-4 w-4" />Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
