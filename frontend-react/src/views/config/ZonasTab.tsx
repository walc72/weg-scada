import { useState } from 'react'
import { useConfigStore } from '../../store/config'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { ChevronRight, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { GAUGE_DEFAULTS } from '../../lib/gaugeDefaults'
import { gaugeListFor } from './comun'

// ─── Zones Tab ──────────────────────────────────────────────────
const METER_GAUGE_LABELS: Array<{ key: string; label: string; unit: string; hasRedLow?: boolean }> = [
  { key: 'voltage', label: 'Tensión',          unit: 'kV', hasRedLow: true },
  { key: 'current', label: 'Corriente',         unit: 'A'  },
  { key: 'power',   label: 'Potencia',          unit: 'kW' },
  { key: 'pf',      label: 'Factor de Potencia', unit: ''  },
]

export default function ZonasTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const [openSite, setOpenSite] = useState<Record<string, boolean>>({})
  const [openDrive, setOpenDrive] = useState<Record<string, boolean>>({})
  const [openMeter, setOpenMeter] = useState<Record<string, boolean>>({})

  // Build per-drive zones merged with defaults
  const drives = cfg.devices.map((dev) => {
    const def = JSON.parse(JSON.stringify(GAUGE_DEFAULTS[dev.type] ?? GAUGE_DEFAULTS.CFW900))
    const saved = cfg.gaugeZones?.[dev.name] ?? {}
    for (const k of Object.keys(saved)) if (def[k]) Object.assign(def[k], saved[k])
    return { name: dev.name, type: dev.type, site: dev.site || 'Sin Sitio', zones: def }
  })

  const sites = Array.from(new Set(drives.map((d) => d.site)))
  const meters = cfg.meters

  function updateZone(driveName: string, gaugeKey: string, field: string, val: number) {
    const gz = JSON.parse(JSON.stringify(cfg.gaugeZones ?? {}))
    if (!gz[driveName]) gz[driveName] = {}
    if (!gz[driveName][gaugeKey]) gz[driveName][gaugeKey] = {}
    gz[driveName][gaugeKey][field] = val
    store.setConfig({ ...cfg, gaugeZones: gz })
  }

  function resetDrive(name: string) {
    const gz = JSON.parse(JSON.stringify(cfg.gaugeZones ?? {}))
    delete gz[name]
    store.setConfig({ ...cfg, gaugeZones: gz })
  }

  // Verde fijo: por equipo (clave '*') o por dato (clave del gauge)
  const isPlain = (name: string, key: string) => cfg.plainGauges?.[name]?.[key] === true
  function setPlain(name: string, key: string, val: boolean) {
    const pg: Record<string, Record<string, boolean>> = JSON.parse(JSON.stringify(cfg.plainGauges ?? {}))
    if (!pg[name]) pg[name] = {}
    if (val) pg[name][key] = true; else delete pg[name][key]
    if (Object.keys(pg[name]).length === 0) delete pg[name]
    store.setConfig({ ...cfg, plainGauges: pg })
  }

  // Setpoints resueltos por equipo (default por tipo + override por nombre)
  function resolvedSp(driveName: string, type: string): Record<string, number> {
    const as: any = cfg.alarmSetpoints ?? {}
    return { ...(as.defaults?.[type] ?? {}), ...(as.overrides?.[driveName] ?? {}) }
  }
  function updateSetpoint(driveName: string, field: string, val: number | null) {
    const as = JSON.parse(JSON.stringify(cfg.alarmSetpoints ?? { defaults: {}, overrides: {} }))
    if (!as.overrides) as.overrides = {}
    if (!as.overrides[driveName]) as.overrides[driveName] = {}
    if (val === null || Number.isNaN(val)) delete as.overrides[driveName][field]
    else as.overrides[driveName][field] = val
    store.setConfig({ ...cfg, alarmSetpoints: as })
  }

  function updateMeterZone(meterName: string, zoneKey: string, field: string, val: number) {
    const newMeters = cfg.meters.map(m => {
      if (m.name !== meterName) return m
      const zones = JSON.parse(JSON.stringify(m.ui?.zones ?? {}))
      if (!zones[zoneKey]) zones[zoneKey] = {}
      zones[zoneKey][field] = val
      return { ...m, ui: { ...(m.ui ?? {}), zones } }
    })
    store.setConfig({ ...cfg, meters: newMeters })
  }

  // Cada límite (verde/amarillo/rojo bajo) tiene que caer entre el mín. y el máx.
  // del gauge: fuera de rango el gauge no se puede dibujar.
  function zoneErrors(): string[] {
    const errs: string[] = []
    const check = (who: string, gauge: string, z: any) => {
      if (!z) return
      const min = Number(z.min ?? 0), max = Number(z.max)
      for (const f of ['redLow', 'green', 'yellow'] as const) {
        const v = z[f]
        if (v == null) continue
        if (!Number.isFinite(Number(v)) || (Number.isFinite(max) && (v < min || v > max))) {
          errs.push(`${who} · ${gauge}: ${f === 'green' ? 'verde' : f === 'yellow' ? 'amarillo' : 'rojo bajo'} = ${v} (rango ${min}–${Number.isFinite(max) ? max : '?'})`)
        }
      }
    }
    for (const d of drives) for (const [k, z] of Object.entries(d.zones)) check(d.name, k, z)
    for (const m of meters) for (const [k, z] of Object.entries(m.ui?.zones ?? {})) check(m.name, k, z)
    return errs
  }

  async function saveAll() {
    const errs = zoneErrors()
    if (errs.length) {
      toast.error(`Límites fuera de rango: ${errs.slice(0, 3).join(' · ')}${errs.length > 3 ? ` (y ${errs.length - 3} más)` : ''}`)
      return
    }
    if (await store.save()) toast.success('Zonas guardadas')
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-widest uppercase">Zonas de Gauges</h2>
        <Button onClick={saveAll}><Save className="h-4 w-4" />Guardar Cambios</Button>
      </div>
      <p className="text-sm text-muted-foreground">Configure los rangos Verde/Amarillo/Rojo para cada gauge. El toggle "verde fijo" apaga la coloración por umbrales de ese equipo.</p>

      {/* ── Drives ── */}
      {sites.map((site) => (
        <div key={site} className="border rounded-md overflow-hidden">
          <button
            onClick={() => setOpenSite({ ...openSite, [site]: !openSite[site] })}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/60 border-b text-xs font-bold tracking-widest uppercase"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${openSite[site] ? 'rotate-90' : ''}`} />
            <strong>{site}</strong>
            <span className="text-xs opacity-80">({drives.filter((d) => d.site === site).length} bombas)</span>
          </button>
          {openSite[site] && (
            <div className="p-3 space-y-2">
              {drives.filter((d) => d.site === site).map((zd) => (
                <div key={zd.name} className="border rounded-md overflow-hidden">
                  <button
                    onClick={() => setOpenDrive({ ...openDrive, [zd.name]: !openDrive[zd.name] })}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50"
                  >
                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${openDrive[zd.name] ? 'rotate-90' : ''}`} />
                    <strong className="text-primary">{zd.name}</strong>
                    <Badge variant="secondary" className="text-[10px]">{zd.type}</Badge>
                  </button>
                  {openDrive[zd.name] && (
                    <div className="p-3 space-y-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Gauge</th>
                            <th className="p-2">Min</th>
                            <th className="p-2">Max</th>
                            <th className="p-2" style={{ color: 'var(--p1-text)' }}>Mínimo (alarma)</th>
                            <th className="p-2">Normal hasta</th>
                            <th className="p-2" style={{ color: 'var(--p3-text)' }}>Alerta hasta</th>
                            <th className="p-2">Verde fijo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gaugeListFor(zd.type).map((g) => (
                            <tr key={g.key}>
                              <td className="p-2 font-bold">{g.label} <span className="text-muted-foreground text-[10px]">({g.unit})</span></td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].min ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'min', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].max ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'max', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                              <td className="p-1">
                                {g.key === 'tension'
                                  ? <Input type="number" value={zd.zones[g.key].redLow ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'redLow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-(--p1)" />
                                  : <span className="text-muted-foreground text-center block">-</span>}
                              </td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].green ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'green', +e.target.value)} className="h-8 text-center w-20 mx-auto border-border" /></td>
                              <td className="p-1"><Input type="number" value={zd.zones[g.key].yellow ?? ''} onChange={(e) => updateZone(zd.name, g.key, 'yellow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-(--p3)" /></td>
                              <td className="p-1 text-center"><input type="checkbox" title="Verde fijo (sin coloración) para este dato" checked={isPlain(zd.name, g.key)} onChange={(e) => setPlain(zd.name, g.key, e.target.checked)} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="pt-3 mt-1 border-t">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Setpoints — colores</div>
                        <p className="text-[11px] text-muted-foreground mb-2">Los umbrales de alarma (temperatura, corriente, errores de comunicación) están en la pestaña <strong>Alarmas</strong>.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                          {[
                            { key: 'powerHigh', label: 'Potencia alta (kW)', step: '1' },
                            { key: 'frequencyHigh', label: 'Frec. alta (Hz)', step: '0.1' },
                          ].map((f) => (
                            <label key={f.key} className="text-xs flex flex-col gap-1">
                              <span className="text-muted-foreground">{f.label}</span>
                              <Input
                                type="number"
                                step={f.step}
                                value={resolvedSp(zd.name, zd.type)[f.key] ?? ''}
                                onChange={(e) => updateSetpoint(zd.name, f.key, e.target.value === '' ? null : +e.target.value)}
                                className="h-8"
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap pt-1">
                        <Button size="sm" variant="outline" onClick={() => resetDrive(zd.name)}><RotateCcw className="h-3 w-3" />Restaurar defaults</Button>
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input type="checkbox" checked={isPlain(zd.name, '*')} onChange={(e) => setPlain(zd.name, '*', e.target.checked)} />
                          Verde fijo — todo el equipo
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* ── Medidores ── */}
      {meters.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <button
            onClick={() => setOpenSite({ ...openSite, __meters__: !openSite.__meters__ })}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/60 border-b text-xs font-bold tracking-widest uppercase"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${openSite.__meters__ ? 'rotate-90' : ''}`} />
            Medidores
            <span className="text-xs opacity-80">({meters.length})</span>
          </button>
          {openSite.__meters__ && <div className="p-3 space-y-2">
            {meters.map((m) => {
              const mz = (m.ui?.zones ?? {}) as Record<string, any>
              const title = (cfg as any).meterNames?.[m.name] || m.ui?.title || m.name
              return (
                <div key={m.name} className="border rounded-md overflow-hidden">
                  <button
                    onClick={() => setOpenMeter({ ...openMeter, [m.name]: !openMeter[m.name] })}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50"
                  >
                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${openMeter[m.name] ? 'rotate-90' : ''}`} />
                    <strong>{title}</strong>
                    <Badge variant="secondary" className="text-[10px]">{m.type}</Badge>
                  </button>
                  {openMeter[m.name] && (
                    <div className="p-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Gauge</th>
                            <th className="p-2">Min</th>
                            <th className="p-2">Max</th>
                            <th className="p-2" style={{ color: 'var(--p1-text)' }}>Mínimo (alarma)</th>
                            <th className="p-2">Normal hasta</th>
                            <th className="p-2" style={{ color: 'var(--p3-text)' }}>Alerta hasta</th>
                            <th className="p-2">Verde fijo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {METER_GAUGE_LABELS.map((g) => {
                            const z = mz[g.key] ?? {}
                            return (
                              <tr key={g.key}>
                                <td className="p-2 font-bold">{g.label} {g.unit && <span className="text-muted-foreground text-[10px]">({g.unit})</span>}</td>
                                <td className="p-1"><Input type="number" step="any" value={z.min ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'min', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                                <td className="p-1"><Input type="number" step="any" value={z.max ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'max', +e.target.value)} className="h-8 text-center w-20 mx-auto" /></td>
                                <td className="p-1">
                                  {g.hasRedLow
                                    ? <Input type="number" step="any" value={z.redLow ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'redLow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-(--p1)" />
                                    : <span className="text-muted-foreground text-center block">-</span>}
                                </td>
                                <td className="p-1"><Input type="number" step="any" value={z.green ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'green', +e.target.value)} className="h-8 text-center w-20 mx-auto border-border" /></td>
                                <td className="p-1"><Input type="number" step="any" value={z.yellow ?? ''} onChange={(e) => updateMeterZone(m.name, g.key, 'yellow', +e.target.value)} className="h-8 text-center w-20 mx-auto border-(--p3)" /></td>
                                <td className="p-1 text-center"><input type="checkbox" title="Verde fijo (sin coloración) para este dato" checked={isPlain(m.name, g.key)} onChange={(e) => setPlain(m.name, g.key, e.target.checked)} /></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <label className="flex items-center gap-2 text-xs cursor-pointer select-none pt-2 mt-1 border-t">
                        <input type="checkbox" checked={isPlain(m.name, '*')} onChange={(e) => setPlain(m.name, '*', e.target.checked)} />
                        Verde fijo — todo el medidor
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>}
        </div>
      )}
    </Card>
  )
}
