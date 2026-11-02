import { memo, type ReactNode } from 'react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { SinEnlaceBadge } from './SinEnlaceBadge'
import HalfGauge from './HalfGauge'
import type { Meter } from '../types'
import { Zap, CheckCircle, PowerOff, WifiOff, TrendingUp } from 'lucide-react'
import { isStale } from '../store/drives'
import { useNow } from '@/lib/useNow'
import { useConfigStore } from '../store/config'
import VerEnUnifilar from './unifilar/VerEnUnifilar'

interface Props {
  m: Meter
  zones?: Record<string, any>
  meterName?: string
  energyKwh?: number
  maxPowerKw?: number   // potencia máxima alcanzada en el día (kW)
  hero?: boolean
  selector?: ReactNode  // control para elegir el medidor (panel de medición principal)
  vertical?: boolean    // barras apiladas en una columna
}

export default memo(function PM8000Card({ m, zones, meterName, energyKwh, maxPowerKw, hero, selector, vertical }: Props) {
  const z = zones ?? {}
  const now = useNow()
  const stale = m.online && isStale(m._ts, now, m.pollMs)
  const plainMap = useConfigStore(s => s.config?.plainGauges?.[m.name])
  const pl = (k: string) => plainMap?.['*'] === true || plainMap?.[k] === true

  const v = z.voltage || { min: 0, max: 36, redLow: 30, green: 33, yellow: 34.5 }
  const i = z.current || { min: 0, max: 200, green: 120, yellow: 170 }
  const p = z.power   || { min: 0, max: 2000, green: 1500, yellow: 1800 }
  const f = z.pf      || { min: 0, max: 1, green: 0.85, yellow: 0.95 }

  const title = meterName || m.name

  // Inductivo (i) / capacitivo (c) según el signo de la reactiva (Q).
  // Q > 0 = inductivo (atraso), Q < 0 = capacitivo (adelanto). Sin dato → sin etiqueta.
  const pfSuffix = m.reactive == null || m.reactive === 0 ? '' : (m.reactive > 0 ? 'i' : 'c')

  const gauges = [
    { key: 'voltage', value: (m.voltage || 0) / 1000, label: 'Tensión L-L', unit: 'kV', ...v, decimals: 2 },
    { key: 'current', value: m.current || 0,          label: 'Corriente',   unit: 'A',  ...i },
    { key: 'power',   value: (m.power || 0) / 1000,   label: 'Potencia',    unit: 'kW', ...p },
    { key: 'pf',      value: m.pf || 0,               label: 'Factor Pot.', unit: '',   ...f, decimals: 2, bipolar: true, suffix: pfSuffix }
  ]

  return (
    <Card className="h-full flex flex-col" style={m.online && !stale ? undefined : { borderColor: 'var(--st-com)', borderStyle: 'dashed' }}>
      {/* Cabecera de alto fijo: renglón 1 nombre + estado, renglón 2 datos del día.
          Nada se reacomoda con el largo del nombre ni cuando cambian los valores. */}
      <div className="p-4 pb-2 space-y-1">
        <div className={`flex items-center gap-2 min-w-0 ${vertical ? 'flex-wrap' : ''}`}>
          {vertical ? <h2 className="text-xs font-bold tracking-widest whitespace-nowrap">MEDICIÓN PRINCIPAL</h2> : <>
          <Zap className={hero ? 'h-6 w-6 text-muted-foreground shrink-0' : 'h-5 w-5 text-muted-foreground shrink-0'} />
          <span className={`${hero ? 'font-bold text-lg sm:text-xl' : 'font-bold text-base'} truncate min-w-0`} title={title}>{title}</span>
          </>}
          <VerEnUnifilar equipo={m.name} />
          <Badge variant="secondary" className="shrink-0">{m.type || 'PM8000'}</Badge>
          {selector}
          <span className="ml-auto shrink-0">
            {m.license === 'excedido' ? (
              <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold"><PowerOff className="h-3 w-3" /> FUERA DE LICENCIA</Badge>
            ) : stale ? (
              <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold"><WifiOff className="h-3 w-3" /> DESACTUALIZADO</Badge>
            ) : m.online ? (vertical ? null : (
              <Badge variant="outline" className="gap-1 px-3 py-1 text-xs font-bold"><CheckCircle className="h-3 w-3" /> ONLINE</Badge>
            )) : m.sinEnlace ? <SinEnlaceBadge name={m.sinEnlace} /> : (
              <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs font-bold"><PowerOff className="h-3 w-3" /> OFFLINE</Badge>
            )}
          </span>
        </div>
        {!vertical && (
          <div className="flex items-center gap-3 h-5 overflow-hidden whitespace-nowrap text-xs font-semibold text-muted-foreground font-mono tabular-nums">
            <span className="flex items-center gap-1" title="Potencia máxima alcanzada hoy (desde 00:00)">
              <TrendingUp className="h-3 w-3" />{m.online && typeof maxPowerKw === 'number' ? (Math.abs(maxPowerKw) >= 100 ? maxPowerKw.toFixed(0) : maxPowerKw.toFixed(1)) : '—'} kW máx
            </span>
            <span className="flex items-center gap-1" title="Energía acumulada de hoy (desde 00:00, igual que el Reporte Diario)">
              <Zap className="h-3 w-3" />{typeof energyKwh === 'number' ? (energyKwh >= 100 ? energyKwh.toFixed(0) : energyKwh.toFixed(1)) : '—'} kWh hoy
            </span>
            <span>{m.online && m.frequency ? m.frequency.toFixed(2) : '—'} Hz</span>
          </div>
        )}
      </div>
      <div className="border-b" />
      {m.online ? (
        <div className={vertical ? 'grid grid-cols-1 gap-5 p-4' : hero ? 'grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 p-5' : 'grid grid-cols-2 gap-x-5 gap-y-3 p-4'}>
          {gauges.map(({ key: gk, ...g }) => <HalfGauge key={gk} {...g} stale={stale} big={hero} plain={pl(gk)} escala={vertical} />)}
          {vertical && <PanelPie m={m} energyKwh={energyKwh} maxPowerKw={maxPowerKw} />}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-muted-foreground">
          <PowerOff className="h-9 w-9 mx-auto mb-1 opacity-50" />
          <div className="text-sm">{m.sinEnlace ? 'Sin enlace' : 'Medidor sin conexión'}</div>
        </div>
      )}
    </Card>
  )
})

// Pie del panel de medición principal: valores por fase (los que el medidor
// informa) y datos del día.
function PanelPie({ m, energyKwh, maxPowerKw }: { m: Meter; energyKwh?: number; maxPowerKw?: number }) {
  const n = (v: number, d = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
  const tri = (a?: number | null, b?: number | null, c?: number | null) => (a != null && b != null && c != null ? [a, b, c] : null)
  const filas = [
    { label: 'Tensión kV', v: tri(m.voltageAB, m.voltageBC, m.voltageCA), f: (x: number) => n(x / 1000, 2) },
    { label: 'Corriente A', v: tri(m.currentA, m.currentB, m.currentC), f: (x: number) => n(x, 1) },
    { label: 'THD-I %', v: tri(m.thdIA, m.thdIB, m.thdIC), f: (x: number) => n(x, 1) },
    { label: 'Potencia kW', v: tri(m.powerA, m.powerB, m.powerC), f: (x: number) => n(x / 1000, 1) },
  ].filter(r => r.v)
  return (
    <div className="flex flex-col gap-3">
      {filas.length > 0 && (
        <table className="w-full table-fixed border-collapse text-xs">
          <caption className="text-left text-[11px] text-muted-foreground tracking-widest pb-1.5">POR FASE</caption>
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th scope="col" className="text-left font-medium py-1 border-b w-[36%]"></th>
              {['L1', 'L2', 'L3'].map(l => <th key={l} scope="col" className="text-right font-medium py-1 border-b">{l}</th>)}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {filas.map(r => (
              <tr key={r.label}>
                <th scope="row" className="text-left font-sans font-medium text-muted-foreground py-1.5">{r.label}</th>
                {r.v!.map((x, i) => <td key={i} className="text-right">{r.f(x)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex justify-between flex-wrap gap-2 border-t pt-2 font-mono text-[11px] text-muted-foreground">
        <span>{m.frequency ? `${n(m.frequency, 2)} Hz` : '— Hz'}</span>
        {typeof maxPowerKw === 'number' && <span>Máx hoy {n(maxPowerKw)} kW</span>}
        {typeof energyKwh === 'number' && <span>{n(energyKwh)} kWh hoy</span>}
      </div>
    </div>
  )
}
