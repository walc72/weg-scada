import { useMemo, useState } from 'react'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useLicense } from '../store/license'
import type { Meter } from '../types'
import MotorStrip from '../components/MotorStrip'
import DriveTable from '../components/DriveTable'
import AlarmBanner from '../components/AlarmBanner'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import RecoCard from '../components/RecoCard'
import RegCard from '../components/RegCard'
import CampoDetalle from '../components/CampoDetalle'
import Fasorial, { FASOR_COLORES, fasorEquipos, porBanco } from '../components/Fasorial'
import { fmt } from '../components/CampoBase'
import Mimico, { tensionCarga } from '../components/Mimico'
import type { CampoConfig } from '../types'
import { Card } from '../components/ui/card'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDailyEnergy, type DailyStat } from '@/lib/useDailyEnergy'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const BANCOS_KEY = 'weg_bancos_cerrados'

type Tab = 'drives' | 'medidores' | 'reguladores' | 'reconectadores'

export default function Dashboard() {
  const drives = useDrivesStore((s) => s.drives)
  const meters = useDrivesStore((s) => s.meters)
  const config = useConfigStore(s => s.config)
  const configReady = config !== null
  const gaugeZones = config?.gaugeZones ?? {}

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const campo = useDrivesStore((s) => s.campo)
  const hasUnifilar = useLicense(s => s.hasModule('unifilar'))
  const hasMedidores = useLicense(s => s.hasModule('medidores'))
  const hasCaudales = useLicense(s => s.hasModule('caudales'))
  const flowmeters = useDrivesStore((s) => s.flowmeters)
  const meterList = useMemo(() => hasMedidores ? selectMeterList(meters) : [], [meters, hasMedidores])

  // Datos del día por equipo (kWh, potencia máx, horas de marcha). Live: el mismo
  // cálculo del Reporte Diario (/api/reports/daily); mock: estimados para la demo.
  const liveDaily = useDailyEnergy()
  const daily = useMemo(() => {
    if (MODE !== 'mock') return liveDaily
    const m = new Map<string, DailyStat>()
    driveList.forEach(d => { if (d.online) m.set(d.name, { energyKwh: +((d.power || 0) * 6.2).toFixed(0), maxPowerKw: +((d.power || 0) * 1.1).toFixed(1), opHours: d.running ? 6.2 : 0 }) })
    meterList.forEach(mt => { if (mt.online) m.set(mt.name, { energyKwh: +(((mt.power || 0) / 1000) * 6.2).toFixed(0), maxPowerKw: +(((mt.power || 0) / 1000) * 1.1).toFixed(1), opHours: null }) })
    return m
  }, [liveDaily, driveList, meterList])
  const energyOf = (name: string) => daily.get(name)?.energyKwh
  const maxOf = (name: string) => daily.get(name)?.maxPowerKw ?? undefined

  const [tab, setTab] = useState<Tab>('drives')
  const [heroName, setHeroName] = useState<string | null>(null)

  const cfgMeter = (name: string) => config?.meters?.find(c => c.name === name)
  const displayName = (m: Meter) => cfgMeter(m.name)?.ui?.title || (config as any)?.meterNames?.[m.name] || m.name

  // Balance / pérdida: principal − Σ seleccionados (potencia en vivo + energía hoy)
  const loss = config?.lossMeter
  const lossData = useMemo(() => {
    if (!loss?.main) return null
    const byName = new Map(meterList.map(m => [m.name, m]))
    const main = byName.get(loss.main)
    if (!main) return null
    const subNames = loss.subtract || []
    const subPowerW = subNames.reduce((s, n) => s + ((byName.get(n)?.power) || 0), 0)
    const powerKw = ((main.power || 0) - subPowerW) / 1000
    const energyKwh = (energyOf(loss.main) ?? 0) - subNames.reduce((s, n) => s + (energyOf(n) ?? 0), 0)
    return { powerKw, energyKwh, mainName: displayName(main), subLabels: subNames.map(n => { const m = byName.get(n); return m ? displayName(m) : n }) }
  }, [loss, meterList, daily])

  // Medidor principal: el elegido en pantalla; si no, el configurado como
  // principal (config.primaryMeter); si no, el primero online; si no, el primero.
  const primaryMeter = config?.primaryMeter
  const hero = useMemo(() => {
    if (heroName) { const h = meterList.find(m => m.name === heroName); if (h) return h }
    if (primaryMeter) { const p = meterList.find(m => m.name === primaryMeter); if (p) return p }
    return meterList.find(m => m.online) ?? meterList[0] ?? null
  }, [heroName, meterList, primaryMeter])

  // Selector: el principal configurado primero, el resto en su orden
  const meterButtons = useMemo(() => {
    if (!primaryMeter) return meterList
    const p = meterList.find(m => m.name === primaryMeter)
    return p ? [p, ...meterList.filter(m => m.name !== primaryMeter)] : meterList
  }, [meterList, primaryMeter])

  const otherMeters = meterButtons.filter(m => !hero || m.name !== hero.name)

  // KPIs: potencia/energía/frecuencia del medidor principal; caudal de los caudalímetros
  const kpis = useMemo(() => {
    const drivesKw = driveList.reduce((t, d) => t + (d.online ? d.power || 0 : 0), 0)
    // Caudal: caudalímetros en línea + bombas con caudal manual (no se pisan: una bomba es manual o tiene caudalímetro)
    const manuales = new Set((config?.devices ?? []).filter(x => x.caudal?.modo === 'manual').map(x => x.name))
    const conCaudal = hasCaudales && ((config?.flowmeters?.length ?? 0) > 0 || manuales.size > 0)
    const flow = !conCaudal ? 0
      : [...flowmeters.values()].reduce((t, f) => t + (f.online && f.flow != null ? f.flow : 0), 0)
        + driveList.reduce((t, d) => t + (manuales.has(d.name) && d.online && d.flow != null ? d.flow : 0), 0)
    const heroKw = hero?.online ? (hero.power || 0) / 1000 : null
    const e = hero ? energyOf(hero.name) : undefined
    const n = (v: number, d = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
    const out: { label: string; value: string; unit: string; title?: string }[] = [
      { label: 'MOTORES EN MARCHA', value: `${driveList.filter(d => d.online && d.running).length} / ${driveList.length}`, unit: '' },
      { label: 'POTENCIA TOTAL', value: n(heroKw ?? drivesKw), unit: 'kW' },
    ]
    if (conCaudal) out.push({ label: 'CAUDAL TOTAL', value: n(flow), unit: 'm³/h' })
    if (typeof e === 'number') out.push({ label: 'ENERGÍA HOY', value: n(e), unit: 'kWh' })
    if (conCaudal) out.push({ label: 'kWh / m³', value: flow > 0 ? n(drivesKw / flow, 2) : '—', unit: '' })
    if (hero?.online && hero.frequency) out.push({ label: 'FRECUENCIA RED', value: n(hero.frequency, 2), unit: 'Hz' })
    // Pérdida (balance de líneas): principal − Σ seleccionados
    if (lossData) {
      const f = `${lossData.mainName} − (${lossData.subLabels.join(' + ') || 'nada'})`
      out.push({ label: 'PÉRDIDA DE POTENCIA', value: n(lossData.powerKw, 1), unit: 'kW', title: f })
      out.push({ label: 'PÉRDIDA DE ENERGÍA HOY', value: n(lossData.energyKwh), unit: 'kWh', title: f })
    }
    return out
  }, [driveList, flowmeters, hasCaudales, hero, daily, lossData, config])

  // Reguladores / reconectadores (módulo unifilar): solo los habilitados en la config
  const regs = hasUnifilar ? (config?.reguladores ?? []).filter(c => c.enabled !== false) : []
  const recos = hasUnifilar ? (config?.reconectadores ?? []).filter(c => c.enabled !== false) : []
  const [detalle, setDetalle] = useState<CampoConfig | null>(null)
  // bancos colapsados: preferencia de este navegador
  const [cerrados, setCerrados] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(BANCOS_KEY) || '[]') } catch { return [] } })
  const alternar = (b: string) => setCerrados(prev => {
    const next = prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    try { localStorage.setItem(BANCOS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'drives', label: 'Motores (CFW / SSW)', count: driveList.length },
    { key: 'medidores', label: 'Medidores', count: meterList.length },
    ...(regs.length ? [{ key: 'reguladores' as Tab, label: 'Reguladores', count: regs.length }] : []),
    ...(recos.length ? [{ key: 'reconectadores' as Tab, label: 'Reconectadores', count: recos.length }] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <AlarmBanner drives={driveList} />

      {/* Indicadores de planta */}
      <section aria-label="Indicadores de planta" className="grid gap-px border bg-border" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {kpis.map(k => (
          <div key={k.label} className="bg-card px-3.5 py-2.5 flex flex-col justify-between gap-0.5" title={k.title}>
            <span className="text-[11px] text-muted-foreground tracking-widest">{k.label}</span>
            <span className="font-mono text-2xl font-medium tabular-nums">{k.value} <span className="text-[13px] text-muted-foreground">{k.unit}</span></span>
          </div>
        ))}
      </section>

      {/* Mímico + medición principal */}
      <div className="flex flex-wrap gap-4 items-stretch">
        {driveList.length > 0 && configReady && (
          <div className="min-w-0" style={{ flex: '999 1 640px' }}>
            <MotorStrip drives={driveList} gaugeZones={gaugeZones} />
          </div>
        )}
        {hero && (
          <div className="min-w-0" style={{ flex: '1 1 380px' }}>
            <PM8000Card m={hero} zones={cfgMeter(hero.name)?.ui?.zones} meterName={displayName(hero)} energyKwh={energyOf(hero.name)} maxPowerKw={maxOf(hero.name)} hero vertical
              selector={meterButtons.length > 1 ? (
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  Medidor
                  <select value={hero.name} onChange={e => setHeroName(e.target.value)}
                    className="bg-background text-foreground border border-border text-xs px-1.5 min-h-[28px] max-w-[230px]">
                    {meterButtons.map(m => <option key={m.name} value={m.name}>{displayName(m)}{m.online ? '' : ' (sin com.)'}</option>)}
                  </select>
                </label>
              ) : undefined} />
          </div>
        )}
      </div>

      {driveList.length > 0 && configReady && <DriveTable drives={driveList} gaugeZones={gaugeZones} />}

      {/* Pestañas Bombas / Medidores */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full', tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Contenido de la pestaña */}
      {tab === 'reguladores' ? (
        <div className="flex flex-col gap-6">
          {/* un bloque por banco (fases de un mismo equipo); los sin banco, juntos como un bloque más */}
          {porBanco(regs).map(g => {
            const fasor = fasorEquipos(g.regs, campo)
            const cerrado = !!g.banco && cerrados.includes(g.banco)
            const enLinea = g.regs.filter(c => campo.get(c.name)?.online).length
            return (
              <div key={g.banco ?? ''} className={cn('flex flex-col gap-4', g.banco && 'rounded-xl border border-border bg-muted/30 p-4')}>
                {g.banco && (
                  <button type="button" onClick={() => alternar(g.banco!)} aria-expanded={!cerrado}
                    className="flex items-center gap-2 text-left">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', cerrado && '-rotate-90')} />
                    <span className="text-sm font-semibold">{g.banco}</span>
                    <span className="text-xs text-muted-foreground">{enLinea}/{g.regs.length} en línea</span>
                  </button>
                )}
                {!cerrado && <>
                  <Card className={cn('p-4', g.banco ? 'grid gap-6 items-center lg:grid-cols-2' : 'flex flex-wrap items-start gap-x-8 gap-y-4')}>
                    {g.banco ? <Mimico regs={g.regs} campo={campo} /> : (
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {g.regs.map((c, i) => {
                          const st = campo.get(c.name)
                          const t = tensionCarga(c, st)
                          return (
                            <div key={c.name}>
                              <div className="text-[11px] uppercase text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: FASOR_COLORES[i % FASOR_COLORES.length] }} />{c.name} · Tensión carga</div>
                              <div className="text-2xl font-semibold tabular-nums">{st?.online ? fmt(t.v, t.dec, t.unidad) : '—'}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {fasor.length > 0 && <Fasorial equipos={fasor} size={g.banco ? 220 : 150} lado={!!g.banco} />}
                  </Card>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {g.regs.map(c => <RegCard key={c.name} st={campo.get(c.name)} cfg={c} onOpen={() => setDetalle(c)} />)}
                  </div>
                </>}
              </div>
            )
          })}
        </div>
      ) : tab === 'reconectadores' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recos.map(c => <RecoCard key={c.name} st={campo.get(c.name)} cfg={c} onOpen={() => setDetalle(c)} />)}
        </div>
      ) : tab === 'drives' ? (
        driveList.length > 0 && configReady ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-fr">
            {driveList.map((d) => (
              <DriveCard key={d.name} d={d} gaugeZones={gaugeZones}
                energyKwh={energyOf(d.name)} maxPowerKw={maxOf(d.name)} opHoursToday={daily.get(d.name)?.opHours ?? undefined} />
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-16">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
            Esperando datos de bombas...
          </div>
        )
      ) : (
        otherMeters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {otherMeters.map((m) => <PM8000Card key={m.name} m={m} zones={cfgMeter(m.name)?.ui?.zones} meterName={displayName(m)} energyKwh={energyOf(m.name)} maxPowerKw={maxOf(m.name)} />)}
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-10">No hay otros medidores configurados.</div>
        )
      )}
      {detalle && <CampoDetalle st={campo.get(detalle.name)} cfg={detalle} onClose={() => setDetalle(null)} />}
    </div>
  )
}
