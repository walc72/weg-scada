import { useMemo, useState } from 'react'
import { useDrivesStore, selectDriveList, selectMeterList, computeStats } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useLicense } from '../store/license'
import type { Meter } from '../types'
import Banner from '../components/Banner'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import RecoCard from '../components/RecoCard'
import RegCard from '../components/RegCard'
import CampoDetalle from '../components/CampoDetalle'
import Fasorial, { FASOR_COLORES, fasorEquipos, porBanco } from '../components/Fasorial'
import { puntosLibres, fmt } from '../components/CampoBase'
import type { CampoConfig } from '../types'
import { Card } from '../components/ui/card'
import { ChevronDown, Loader2, TrendingDown } from 'lucide-react'
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
  const connected = useDrivesStore((s) => s.connected)

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const campo = useDrivesStore((s) => s.campo)
  const hasUnifilar = useLicense(s => s.hasModule('unifilar'))
  const hasMedidores = useLicense(s => s.hasModule('medidores'))
  const meterList = useMemo(() => hasMedidores ? selectMeterList(meters) : [], [meters, hasMedidores])
  const stats = useMemo(() => computeStats(drives), [drives])

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
    { key: 'drives', label: 'Bombas (CFW / SSW)', count: driveList.length },
    { key: 'medidores', label: 'Medidores', count: meterList.length },
    ...(regs.length ? [{ key: 'reguladores' as Tab, label: 'Reguladores', count: regs.length }] : []),
    ...(recos.length ? [{ key: 'reconectadores' as Tab, label: 'Reconectadores', count: recos.length }] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <Banner stats={stats} drives={driveList} connected={connected} />

      {/* Medidor principal (siempre arriba) + selector */}
      {meterList.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground uppercase tracking-wide mr-1">Medidor principal</span>
            {meterButtons.map(m => (
              <button
                key={m.name}
                onClick={() => setHeroName(m.name)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors',
                  hero?.name === m.name
                    ? 'bg-primary/15 border-primary/40 text-foreground'
                    : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', m.online ? 'bg-green-500' : 'bg-muted-foreground')} />
                {displayName(m)}
              </button>
            ))}
          </div>
          {hero && (
            <PM8000Card m={hero} zones={cfgMeter(hero.name)?.ui?.zones} meterName={displayName(hero)} energyKwh={energyOf(hero.name)} maxPowerKw={maxOf(hero.name)} hero />
          )}
        </div>
      )}

      {/* Pérdida / balance */}
      {lossData && (
        <Card className="p-4 border-l-4" style={{ borderLeftColor: '#E87722' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              <span className="font-bold text-base">Pérdida (balance de líneas)</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Potencia</div>
                <div className="text-2xl font-semibold tabular-nums leading-tight">{lossData.powerKw.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kW</span></div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Energía hoy</div>
                <div className="text-2xl font-semibold tabular-nums leading-tight">{lossData.energyKwh.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">kWh</span></div>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {lossData.mainName} − ({lossData.subLabels.length ? lossData.subLabels.join(' + ') : 'nada'})
          </div>
        </Card>
      )}

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
                  <Card className="p-4 flex flex-wrap items-start gap-x-8 gap-y-4">
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {g.regs.map((c, i) => {
                        const st = campo.get(c.name)
                        const p = puntosLibres(c).meds.find(m => /tensi[oó]n\s+carga/i.test(m.nombre!))
                        const v = p ? st?.extras?.[p.nombre!] : st?.valores?.v
                        return (
                          <div key={c.name}>
                            <div className="text-[11px] uppercase text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: FASOR_COLORES[i % FASOR_COLORES.length] }} />{c.name} · Tensión carga</div>
                            <div className="text-2xl font-semibold tabular-nums">{st?.online ? fmt(typeof v === 'number' ? v : null, p?.decimales ?? 0, p?.unidad ?? 'V') : '—'}</div>
                          </div>
                        )
                      })}
                    </div>
                    {fasor.length > 0 && <Fasorial equipos={fasor} size={150} />}
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
