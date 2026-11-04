import { SkeletonVista } from '../components/ui/skeleton'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { IconoMedidor, IconoReconectador, IconoRegulador, IconoTabla, IconoVariador } from '../components/IconosEquipo'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useLicense } from '../store/license'
import type { Meter } from '../types'
import DriveTable from '../components/DriveTable'
import DriveCard from '../components/DriveCard'
import PM8000Card from '../components/PM8000Card'
import { RegTabla, RecoTabla } from '../components/CampoTablas'
import Fasorial, { FASOR_COLORES, fasorEquipos, porBanco } from '../components/Fasorial'
import { Chip } from '../components/CampoBase'
import Mimico from '../components/Mimico'
import { cn } from '@/lib/utils'
import { useDailyStats } from '@/lib/useDailyEnergy'

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
  // mímico desplegado por banco (sesión)

  const tabs: { key: Tab; label: string; count?: number; Icono: typeof IconoTabla }[] = [
    { key: 'variables', label: 'Variables', Icono: IconoTabla },
    { key: 'motores', label: 'Motores', count: driveList.length, Icono: IconoVariador },
    ...(meterList.length ? [{ key: 'medidores' as Tab, label: 'Medidores', count: meterList.length, Icono: IconoMedidor }] : []),
    ...(regs.length ? [{ key: 'reguladores' as Tab, label: 'Reguladores', count: regs.length, Icono: IconoRegulador }] : []),
    ...(recos.length ? [{ key: 'reconectadores' as Tab, label: 'Reconectadores', count: recos.length, Icono: IconoReconectador }] : []),
  ]
  const [params, setParams] = useSearchParams()
  const pedido = params.get('tab') as Tab | null
  const tab: Tab = pedido && tabs.some(t => t.key === pedido) ? pedido : 'variables'

  const esperando = <SkeletonVista />

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
            <t.Icono className="h-4 w-4 shrink-0" />
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
              <Link key={d.name} to={`/motor/${encodeURIComponent(d.name)}`} state={{ from: '/equipos?tab=motores' }} className="block hover:ring-1 hover:ring-primary" title="Ver detalle, tendencias y eventos">
                <DriveCard d={d} gaugeZones={gaugeZones}
                  energyKwh={energyOf(d.name)} maxPowerKw={maxOf(d.name)} opHoursToday={daily.get(d.name)?.opHours ?? undefined} />
              </Link>
            ))}
          </div>
        ) : esperando
      ) : tab === 'medidores' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {meterList.map((m) => (
            <Link key={m.name} to={`/medidor/${encodeURIComponent(m.name)}`} className="block hover:ring-1 hover:ring-primary" title="Ver detalle y forma de onda">
              <PM8000Card m={m} zones={cfgMeter(m.name)?.ui?.zones} meterName={displayName(m)} energyKwh={energyOf(m.name)} maxPowerKw={maxOf(m.name)} />
            </Link>
          ))}
        </div>
      ) : tab === 'reconectadores' ? (
        <RecoTabla recos={recos} campo={campo} onOpen={abrir} />
      ) : (
        <div className="flex flex-col gap-6">
          {/* un bloque por banco (fases de un mismo equipo); los sin banco, juntos como un bloque más */}
          {porBanco(regs).map(g => {
            const fasor = fasorEquipos(g.regs, campo)
            const enLinea = g.regs.filter(c => campo.get(c.name)?.online).length
            const taps = g.regs.map(c => ({ n: c.name, t: campo.get(c.name)?.online ? campo.get(c.name)?.valores?.tap : null }))
              .filter((x): x is { n: string; t: number } => typeof x.t === 'number')
            const desbalance = g.banco && taps.length > 1 && Math.max(...taps.map(x => x.t)) - Math.min(...taps.map(x => x.t)) > DESBALANCE_TAPS
            return (
              <section key={g.banco ?? ''} aria-label={g.banco ?? 'Reguladores'} className="bg-card border">
                {/* Cabecera del banco en un renglón: nombre, en línea y desbalance (P3) */}
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-b">
                  <h2 className="text-xs font-bold tracking-widest uppercase">{g.banco ?? 'Reguladores'}</h2>
                  <span className="text-[11px] font-mono text-muted-foreground">{enLinea} / {g.regs.length} EN LÍNEA</span>
                  {desbalance && (
                    <span className="inline-flex items-center gap-1.5 text-xs" title="Diferencia de taps entre fases mayor a la permitida">
                      <Chip tono="p3">DESBALANCE DE TAPS</Chip>
                      <span className="font-mono text-muted-foreground">{taps.map(x => `${x.t > 0 ? '+' : ''}${x.t}`).join(' / ')}</span>
                    </span>
                  )}
                </header>
                <RegTabla regs={g.regs} campo={campo} colores={fasor.length ? FASOR_COLORES : undefined} onOpen={abrir} />
                {/* fasorial y mímico del banco, uno al lado del otro (se apilan en pantallas angostas) */}
                {(fasor.length > 0 || g.banco) && (
                  <div className="flex flex-wrap items-center justify-around gap-4 border-t p-3">
                    {fasor.length > 0 && <Fasorial equipos={fasor} size={130} />}
                    {g.banco && <div className="min-w-0 flex-1 basis-[360px] max-w-[480px]"><Mimico regs={g.regs} campo={campo} /></div>}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
