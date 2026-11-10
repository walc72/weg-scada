import { useMemo, useState } from 'react'
import { useConfigStore } from '../../store/config'
import type { DriveType, MeterUiConfig } from '../../types'
import { Badge } from '../../components/ui/badge'
import { Label } from '../../components/ui/label'
import { Checkbox } from '../../components/ui/checkbox'
import { Table, TableBody } from '../../components/ui/table'
import { SeccionConfig, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import { toast } from 'sonner'
import { conPlano, erroresZonas, fusionarClaves, mensajeErrores, type Mapa, type Zonas } from './supervision'
import { EncabezadoZonas, FilaZona, Plegable, ZonasSitio } from './ZonasSitio'

// ─── Zones Tab ──────────────────────────────────────────────────
const METER_GAUGE_LABELS: Array<{ key: string; label: string; unit: string; hasRedLow?: boolean }> = [
  { key: 'voltage', label: 'Tensión',          unit: 'kV', hasRedLow: true },
  { key: 'current', label: 'Corriente',         unit: 'A'  },
  { key: 'power',   label: 'Potencia',          unit: 'kW' },
  { key: 'pf',      label: 'Factor de Potencia', unit: ''  },
]

const AYUDA = 'Configure los rangos Verde/Amarillo/Rojo para cada gauge. El toggle "verde fijo" apaga la coloración por umbrales de ese equipo.'

export default function ZonasTab() {
  const cfg = useConfigStore(s => s.config)!
  // Bombas agrupadas por sitio (como se muestran)
  const sitios = useMemo(() => {
    const m = new Map<string, Array<{ name: string; type: DriveType }>>()
    for (const d of cfg.devices) {
      const site = d.site || 'Sin Sitio'
      if (!m.has(site)) m.set(site, [])
      m.get(site)!.push({ name: d.name, type: d.type })
    }
    return [...m]
  }, [cfg.devices])

  return (
    <div className="space-y-2">
      {sitios.map(([site, drives], i) => <ZonasSitio key={site} site={site} drives={drives} ayuda={i === 0 ? AYUDA : undefined} />)}
      {cfg.meters.length > 0 && <ZonasMedidores ayuda={sitios.length === 0 ? AYUDA : undefined} />}
    </div>
  )
}

interface Edicion { zones: Mapa<Zonas>; plain: Mapa<Record<string, boolean>> }

function ZonasMedidores({ ayuda }: { ayuda?: string }) {
  const store = useConfigStore()
  const cfg = store.config!
  const meters = cfg.meters
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const ed = useEdicion(useMemo<Edicion>(() => ({
    zones: Object.fromEntries(meters.map(m => [m.name, (m.ui?.zones ?? {}) as unknown as Zonas])),
    plain: Object.fromEntries(meters.map(m => [m.name, cfg.plainGauges?.[m.name] ?? {}])),
  }), [meters, cfg.plainGauges]))
  const v = ed.valor

  const setZona = (name: string, g: string, f: string, val: number) =>
    ed.set(s => ({ ...s, zones: { ...s.zones, [name]: { ...s.zones[name], [g]: { ...s.zones[name]?.[g], [f]: val } } } }))
  const setPlano = (name: string, key: string, val: boolean) =>
    ed.set(s => ({ ...s, plain: { ...s.plain, [name]: conPlano(s.plain[name], key, val) } }))

  const [guardando, correr] = useGuardando()
  const guardar = () => correr(async () => {
    const errs = meters.flatMap(m => erroresZonas(m.name, v.zones[m.name] ?? {}))
    if (errs.length) { toast.error(mensajeErrores(errs)); return }
    const ok = await ed.guardar(e => store.guardar(c => ({
      ...c,
      // Solo los medidores cuyas zonas cambiaron; el resto de cada medidor queda como está.
      meters: c.meters.map(m => {
        const z = e.zones[m.name]
        if (!z || JSON.stringify(z) === JSON.stringify(m.ui?.zones ?? {})) return m
        return { ...m, ui: { ...(m.ui ?? {}), zones: z as unknown as MeterUiConfig['zones'] } }
      }),
      plainGauges: fusionarClaves(c.plainGauges, e.plain),
    })))
    if (ok) toast.success('Zonas guardadas')
  })

  return (
    <SeccionConfig titulo={`Medidores (${meters.length})`} ayuda={ayuda}>
      {meters.map((m) => {
        const mz = v.zones[m.name] ?? {}
        const title = cfg.meterNames?.[m.name] || m.ui?.title || m.name
        return (
          <Plegable key={m.name} abierto={!!open[m.name]} onToggle={() => setOpen({ ...open, [m.name]: !open[m.name] })}
            titulo={<><strong>{title}</strong><Badge variant="secondary" className="text-[10px]">{m.type}</Badge></>}>
            <Table className="text-xs">
              <EncabezadoZonas />
              <TableBody>
                {METER_GAUGE_LABELS.map((g) => (
                  <FilaZona key={g.key} label={g.label} unit={g.unit} zona={mz[g.key] ?? {}} redLow={!!g.hasRedLow} step="any"
                    plano={v.plain[m.name]?.[g.key] === true}
                    onZona={(f, val) => setZona(m.name, g.key, f, val)} onPlano={(val) => setPlano(m.name, g.key, val)} />
                ))}
              </TableBody>
            </Table>
            <Label className="flex items-center gap-2 cursor-pointer select-none pt-2 mt-1 border-t">
              <Checkbox checked={v.plain[m.name]?.['*'] === true} onCheckedChange={(val) => setPlano(m.name, '*', val)} />
              Verde fijo — todo el medidor
            </Label>
          </Plegable>
        )
      })}
      <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
    </SeccionConfig>
  )
}
