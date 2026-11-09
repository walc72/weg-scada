import { useMemo, useState, type ReactNode } from 'react'
import { useConfigStore } from '../../store/config'
import type { AppConfig, DriveType } from '../../types'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Checkbox } from '../../components/ui/checkbox'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { SeccionConfig, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { conPlano, conSetpoints, erroresZonas, fusionarClaves, soloCampos, mensajeErrores, zonasConDefaults, type Mapa, type Zonas } from './supervision'

// Piezas de la pestaña Zonas: encabezado/fila de la tabla de zonas (compartidas con
// medidores), plegable por equipo y la sección de un sitio de bombas.

function gaugeListFor(type: DriveType) {
  const list: Array<{ key: string; label: string; unit: string }> = []
  if (type === 'CFW900') list.push({ key: 'velocidad', label: 'Velocidad', unit: 'RPM' })
  list.push({ key: 'corriente', label: 'Corriente', unit: 'A' })
  list.push({ key: 'tension', label: 'Tensión', unit: 'V' })
  if (type === 'CFW900') list.push({ key: 'frecuencia', label: 'Frecuencia', unit: 'Hz' })
  return list
}

export function EncabezadoZonas() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Gauge</TableHead>
        <TableHead className="text-center">Min</TableHead>
        <TableHead className="text-center">Max</TableHead>
        <TableHead className="text-center" style={{ color: 'var(--p1-text)' }}>Mínimo (alarma)</TableHead>
        <TableHead className="text-center">Normal hasta</TableHead>
        <TableHead className="text-center" style={{ color: 'var(--p3-text)' }}>Alerta hasta</TableHead>
        <TableHead className="text-center">Verde fijo</TableHead>
      </TableRow>
    </TableHeader>
  )
}

export function FilaZona({ label, unit, zona, redLow, step, plano, onZona, onPlano }: {
  label: string; unit: string; zona: Record<string, number>; redLow: boolean; step?: string
  plano: boolean; onZona: (campo: string, v: number) => void; onPlano: (v: boolean) => void
}) {
  const campo = (f: string, borde = '') => (
    <Input type="number" step={step} value={zona[f] ?? ''} onChange={(e) => onZona(f, +e.target.value)} className={`h-8 text-center w-20 mx-auto ${borde}`} />
  )
  return (
    <TableRow>
      <TableCell className="font-bold">{label} {unit && <span className="text-muted-foreground text-[10px]">({unit})</span>}</TableCell>
      <TableCell className="p-1">{campo('min')}</TableCell>
      <TableCell className="p-1">{campo('max')}</TableCell>
      <TableCell className="p-1">{redLow ? campo('redLow', 'border-(--p1)') : <span className="text-muted-foreground text-center block">-</span>}</TableCell>
      <TableCell className="p-1">{campo('green', 'border-border')}</TableCell>
      <TableCell className="p-1">{campo('yellow', 'border-(--p3)')}</TableCell>
      <TableCell className="p-1 text-center">
        <Checkbox title="Verde fijo (sin coloración) para este dato" aria-label={`Verde fijo: ${label}`} checked={plano} onCheckedChange={onPlano} />
      </TableCell>
    </TableRow>
  )
}

export function Plegable({ abierto, onToggle, titulo, children }: { abierto: boolean; onToggle: () => void; titulo: ReactNode; children: ReactNode }) {
  return (
    <div className="border rounded-sm overflow-hidden">
      <Button variant="ghost" onClick={onToggle} aria-expanded={abierto}
        className="w-full h-auto justify-start rounded-none px-4 py-2 bg-muted/30 hover:bg-muted/50 text-sm font-normal normal-case tracking-normal">
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${abierto ? 'rotate-90' : ''}`} />
        {titulo}
      </Button>
      {abierto && <div className="p-3 space-y-2">{children}</div>}
    </div>
  )
}

const SP_FIELDS = [
  { key: 'powerHigh', label: 'Potencia alta (kW)', step: '1' },
  { key: 'frequencyHigh', label: 'Frec. alta (Hz)', step: '0.1' },
]
const SP_CAMPOS = SP_FIELDS.map(f => f.key)

interface Edicion { zones: Mapa<Zonas>; plain: Mapa<Record<string, boolean>>; sp: Mapa<Record<string, number>> }

export function ZonasSitio({ site, drives, ayuda }: { site: string; drives: Array<{ name: string; type: DriveType }>; ayuda?: ReactNode }) {
  const store = useConfigStore()
  const cfg = store.config!
  const [open, setOpen] = useState<Record<string, boolean>>({})

  // Una entrada por bomba del sitio (vacía = sin personalizar).
  const ed = useEdicion(useMemo<Edicion>(() => ({
    zones: Object.fromEntries(drives.map(d => [d.name, (cfg.gaugeZones?.[d.name] ?? {}) as Zonas])),
    plain: Object.fromEntries(drives.map(d => [d.name, cfg.plainGauges?.[d.name] ?? {}])),
    sp: soloCampos(cfg.alarmSetpoints?.overrides, drives.map(d => d.name), SP_CAMPOS),
  }), [drives, cfg.gaugeZones, cfg.plainGauges, cfg.alarmSetpoints]))
  const v = ed.valor

  const setZona = (dev: string, g: string, f: string, val: number) =>
    ed.set(s => ({ ...s, zones: { ...s.zones, [dev]: { ...s.zones[dev], [g]: { ...s.zones[dev]?.[g], [f]: val } } } }))
  const reset = (dev: string) => ed.set(s => ({ ...s, zones: { ...s.zones, [dev]: {} } }))
  const setPlano = (dev: string, key: string, val: boolean) =>
    ed.set(s => ({ ...s, plain: { ...s.plain, [dev]: conPlano(s.plain[dev], key, val) } }))
  const setSp = (dev: string, key: string, val: number | null) => ed.set(s => {
    const r = { ...s.sp[dev] }
    if (val === null || Number.isNaN(val)) delete r[key]; else r[key] = val
    return { ...s, sp: { ...s.sp, [dev]: r } }
  })
  // Setpoint resuelto: override de la bomba o default de su tipo.
  const sp = (dev: string, type: string, key: string) => v.sp[dev]?.[key] ?? cfg.alarmSetpoints?.defaults?.[type]?.[key]

  const [guardando, correr] = useGuardando()
  const guardar = () => correr(async () => {
    const errs = drives.flatMap(d => erroresZonas(d.name, zonasConDefaults(d.type, v.zones[d.name])))
    if (errs.length) { toast.error(mensajeErrores(errs)); return }
    const ok = await ed.guardar(e => store.guardar(c => conSetpoints({
      ...c,
      gaugeZones: fusionarClaves(c.gaugeZones as Mapa<Zonas> | undefined, e.zones) as AppConfig['gaugeZones'],
      plainGauges: fusionarClaves(c.plainGauges, e.plain),
    }, 'overrides', e.sp, SP_CAMPOS)))
    if (ok) toast.success('Zonas guardadas')
  })

  return (
    <SeccionConfig titulo={`${site} (${drives.length} bombas)`} ayuda={ayuda}>
      {drives.map((d) => {
        const zonas = zonasConDefaults(d.type, v.zones[d.name])
        return (
          <Plegable key={d.name} abierto={!!open[d.name]} onToggle={() => setOpen({ ...open, [d.name]: !open[d.name] })}
            titulo={<><strong className="text-primary">{d.name}</strong><Badge variant="secondary" className="text-[10px]">{d.type}</Badge></>}>
            <Table className="text-xs">
              <EncabezadoZonas />
              <TableBody>
              {gaugeListFor(d.type).map((g) => (
                <FilaZona key={g.key} label={g.label} unit={g.unit} zona={zonas[g.key]} redLow={g.key === 'tension'}
                  plano={v.plain[d.name]?.[g.key] === true}
                  onZona={(f, val) => setZona(d.name, g.key, f, val)} onPlano={(val) => setPlano(d.name, g.key, val)} />
              ))}
              </TableBody>
            </Table>

            <div className="pt-3 mt-1 border-t space-y-2">
              <Label>Setpoints — colores</Label>
              <p className="text-[11px] text-muted-foreground">Los umbrales de alarma (temperatura, corriente, errores de comunicación) están en la pestaña <strong>Alarmas</strong>.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                {SP_FIELDS.map((f) => (
                  <div key={f.key} className="text-xs flex flex-col gap-1">
                    <Label htmlFor={`sp-${d.name}-${f.key}`} className="normal-case tracking-normal font-normal text-xs">{f.label}</Label>
                    <Input id={`sp-${d.name}-${f.key}`} type="number" step={f.step} value={sp(d.name, d.type, f.key) ?? ''}
                      onChange={(e) => setSp(d.name, f.key, e.target.value === '' ? null : +e.target.value)} className="h-8" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              <Button size="sm" variant="outline" onClick={() => reset(d.name)}><RotateCcw className="h-3.5 w-3.5" />Restaurar defaults</Button>
              <Label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox checked={v.plain[d.name]?.['*'] === true} onCheckedChange={(val) => setPlano(d.name, '*', val)} />
                Verde fijo — todo el equipo
              </Label>
            </div>
          </Plegable>
        )
      })}
      <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
    </SeccionConfig>
  )
}
