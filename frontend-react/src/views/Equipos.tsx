import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useLicense } from '../store/license'
import type { Meter } from '../types'
import DriveTable from '../components/DriveTable'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import RecoCard from '../components/RecoCard'
import RegCard from '../components/RegCard'
import Fasorial, { FASOR_COLORES, fasorEquipos, porBanco } from '../components/Fasorial'
import { fmt } from '../components/CampoBase'
import Mimico, { tensionCarga } from '../components/Mimico'
import { Card } from '../components/ui/card'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDailyStats } from '@/lib/useDailyEnergy'

const BANCOS_KEY = 'weg_bancos_cerrados'
// Diferencia de taps entre fases de un banco a partir de la cual se avisa
// ponytail: fijo; pasarlo a la config del banco si hace falta otro valor
const DESBALANCE_TAPS = 2

type Tab = 'variables' | 'motores' | 'medidores' | 'reguladores' | 'reconectadores'

// Equipos: el detalle que no entra en la vista general del Dashboard. La
// pestaña queda en la URL (?tab=) para poder enlazarla.
export default function Equipos() {
  const drives = useDrivesStore((s) => s.drives)
  const meters = useDrivesStore((s) => s.meters)
  const campo = useDrivesStore((s) => s.campo)
  const config = useConfigStore(s => s.config)
  const configReady = config !== null
  const gaugeZones = config?.gaugeZones ?? {}
  const hasUnifilar = useLicense(s => s.hasModule('unifilar'))
  const hasMedidores = useLicense(s => s.hasModule('medidores'))

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const meterList = useMemo(() => hasMedidores ? selectMeterList(meters) : [], [meters, hasMedidores])
  const daily = useDailyStats(driveList, meterList)
  const energyOf = (name: string) => daily.get(name)?.energyKwh
  const maxOf = (name: string) => daily.get(name)?.maxPowerKw ?? undefined

  const cfgMeter = (name: string) => config?.meters?.find(c => c.name === name)
  const displayName = (m: Meter) => cfgMeter(m.name)?.ui?.title || (config as any)?.meterNames?.[m.name] || m.name

  // Reguladores / reconectadores (módulo unifilar): solo los habilitados en la config
  const regs = hasUnifilar ? (config?.reguladores ?? []).filter(c => c.enabled !== false) : []
  const recos = hasUnifilar ? (config?.reconectadores ?? []).filter(c => c.enabled !== false) : []
  const navigate = useNavigate()
  const abrir = (name: string) => navigate(`/campo/${encodeURIComponent(name)}`)
  // bancos colapsados: preferencia de este navegador
  const [cerrados, setCerrados] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(BANCOS_KEY) || '[]') } catch { return [] } })
  const alternar = (b: string) => setCerrados(prev => {
    const next = prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    try { localStorage.setItem(BANCOS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'variables', label: 'Variables' },
    { key: 'motores', label: 'Motores', count: driveList.length },
    ...(meterList.length ? [{ key: 'medidores' as Tab, label: 'Medidores', count: meterList.length }] : []),
    ...(regs.length ? [{ key: 'reguladores' as Tab, label: 'Reguladores', count: regs.length }] : []),
    ...(recos.length ? [{ key: 'reconectadores' as Tab, label: 'Reconectadores', count: recos.length }] : []),
  ]
  const [params, setParams] = useSearchParams()
  const pedido = params.get('tab') as Tab | null
  const tab: Tab = pedido && tabs.some(t => t.key === pedido) ? pedido : 'variables'

  const esperando = (
    <div className="text-center text-muted-foreground py-16">
      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
      Esperando datos de los equipos...
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Tipo de equipo" className="flex overflow-x-auto bg-card border">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setParams({ tab: t.key }, { replace: true })}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 px-4 min-h-[44px] text-xs font-semibold tracking-widest uppercase whitespace-nowrap border-b-[3px] transition-colors',
              tab === t.key ? 'border-foreground text-foreground bg-muted' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}>
            {t.label}
            {t.count != null && <span className="font-mono text-[11px] text-muted-foreground">{t.count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'variables' ? (
        driveList.length > 0 && configReady ? <DriveTable drives={driveList} gaugeZones={gaugeZones} /> : esperando
      ) : tab === 'motores' ? (
        driveList.length > 0 && configReady ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-fr">
            {driveList.map((d) => (
              <DriveCard key={d.name} d={d} gaugeZones={gaugeZones}
                energyKwh={energyOf(d.name)} maxPowerKw={maxOf(d.name)} opHoursToday={daily.get(d.name)?.opHours ?? undefined} />
            ))}
          </div>
        ) : esperando
      ) : tab === 'medidores' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {meterList.map((m) => <PM8000Card key={m.name} m={m} zones={cfgMeter(m.name)?.ui?.zones} meterName={displayName(m)} energyKwh={energyOf(m.name)} maxPowerKw={maxOf(m.name)} />)}
        </div>
      ) : tab === 'reconectadores' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recos.map(c => <RecoCard key={c.name} st={campo.get(c.name)} cfg={c} onOpen={() => abrir(c.name)} />)}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* un bloque por banco (fases de un mismo equipo); los sin banco, juntos como un bloque más */}
          {porBanco(regs).map(g => {
            const fasor = fasorEquipos(g.regs, campo)
            const cerrado = !!g.banco && cerrados.includes(g.banco)
            const enLinea = g.regs.filter(c => campo.get(c.name)?.online).length
            const taps = g.regs.map(c => ({ n: c.name, t: campo.get(c.name)?.online ? campo.get(c.name)?.valores?.tap : null }))
              .filter((x): x is { n: string; t: number } => typeof x.t === 'number')
            const desbalance = g.banco && taps.length > 1 && Math.max(...taps.map(x => x.t)) - Math.min(...taps.map(x => x.t)) > DESBALANCE_TAPS
            return (
              <div key={g.banco ?? ''} className={cn('flex flex-col gap-4', g.banco && 'border border-border bg-muted/30 p-4')}>
                {g.banco && (
                  <button type="button" onClick={() => alternar(g.banco!)} aria-expanded={!cerrado}
                    className="flex items-center gap-2 text-left">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', cerrado && '-rotate-90')} />
                    <span className="text-sm font-semibold">{g.banco}</span>
                    <span className="text-xs text-muted-foreground">{enLinea}/{g.regs.length} en línea</span>
                  </button>
                )}
                {desbalance && (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 border text-sm" style={{ borderColor: 'var(--p3)', background: 'color-mix(in srgb, var(--p3) 14%, hsl(var(--card)))' }}>
                    <span className="px-1.5 py-0.5 font-mono text-xs font-bold" style={{ background: 'var(--p3)', color: '#16191C' }}>P3</span>
                    <span className="font-semibold">Desbalance de taps entre fases</span>
                    <span className="font-mono text-muted-foreground">{taps.map(x => `${x.n} ${x.t > 0 ? '+' : ''}${x.t}`).join(' · ')}</span>
                  </div>
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
                    {g.regs.map(c => <RegCard key={c.name} st={campo.get(c.name)} cfg={c} onOpen={() => abrir(c.name)} />)}
                  </div>
                </>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
