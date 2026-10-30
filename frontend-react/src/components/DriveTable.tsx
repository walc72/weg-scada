import { memo } from 'react'
import type { Drive } from '../types'
import type { GaugeZone } from '../lib/gaugeDefaults'
import { resolveZone } from '../lib/gaugeDefaults'
import { isStale } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useNow } from '@/lib/useNow'
import { fmt } from '@/lib/utils'
import { barra } from './HalfGauge'
import { estado } from './MotorStrip'

// Variables de proceso de todos los motores en una tabla densa. Normal = gris;
// la celda se pinta solo si el valor sale de zona (mismas zonas que las barras).
export default memo(function DriveTable({ drives, gaugeZones }: { drives: Drive[]; gaugeZones: Record<string, Record<string, Partial<GaugeZone>>> }) {
  const now = useNow()
  const sp = useConfigStore(s => s.config?.alarmSetpoints)
  const th = 'font-medium px-3 py-2 border-b whitespace-nowrap'
  return (
    <section aria-labelledby="t-proc" className="bg-card border">
      <header className="flex items-center gap-3 px-3 py-2 border-b flex-wrap">
        <h2 id="t-proc" className="text-xs font-bold tracking-widest">VARIABLES DE PROCESO</h2>
        <span className="text-[11px] text-muted-foreground">Valores fuera de rango resaltados · gris = normal</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] tracking-wider text-muted-foreground text-right">
              <th scope="col" className={`${th} text-left`}>EQUIPO</th>
              <th scope="col" className={`${th} text-left`}>ESTADO</th>
              <th scope="col" className={th}>VELOC. rpm</th>
              <th scope="col" className={th}>CORRIENTE A</th>
              <th scope="col" className={th}>TENSIÓN V</th>
              <th scope="col" className={th}>FREC. Hz</th>
              <th scope="col" className={th}>POTENCIA kW</th>
              <th scope="col" className={th}>TORQUE %</th>
              <th scope="col" className={th}>TEMP. °C</th>
              <th scope="col" className={th}>BUS DC V</th>
            </tr>
          </thead>
          <tbody className="font-mono text-right tabular-nums">
            {drives.map(d => {
              const stale = d.online && isStale(d._ts, now, d.pollMs)
              const e = estado(d, stale)
              const cfw = d.type !== 'SSW900'
              // parado o en falla los ceros son esperables: solo se evalúa en marcha
              const live = d.online && !stale && d.running
              const nivel = (k: 'corriente' | 'tension' | 'velocidad' | 'frecuencia', v: number) =>
                live ? barra({ value: v, ...resolveZone(d.type, k, gaugeZones?.[d.name]?.[k]) }).nivel : 'ok'
              const temp = cfw ? d.igbtTemp : d.scrTemp
              const tempHigh = ({ ...(sp?.defaults?.[d.type] ?? {}), ...(sp?.overrides?.[d.name] ?? {}) } as Record<string, number>).tempHigh ?? 90
              const tNivel = !(d.online && !stale) ? 'ok' : temp >= tempHigh ? 'bad' : temp >= tempHigh * 0.85 ? 'warn' : 'ok'
              const off = !d.online
              return (
                <tr key={d.name} className={`border-b border-border/60 ${e.dim ? 'opacity-50' : ''}`}>
                  <th scope="row" className="text-left px-3 py-1.5 font-sans font-semibold whitespace-nowrap">
                    <a href={`#drive-${d.name}`} className="text-foreground hover:underline"
                      onClick={ev => { ev.preventDefault(); document.getElementById(`drive-${d.name}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                      {d.displayName || d.name}
                    </a> <span className="text-[10px] font-normal text-muted-foreground">{d.type}</span>
                  </th>
                  <td className="text-left px-3 py-1.5">
                    <span className="font-sans text-[11px] font-bold tracking-wider px-1.5 py-0.5 border whitespace-nowrap" style={{ background: e.bg, color: e.fg, borderColor: e.bd }}>{e.txt}</span>
                  </td>
                  <Celda v={cfw && !off ? fmt(d.motorSpeed, 0) : '—'} nivel={cfw ? nivel('velocidad', d.motorSpeed) : 'ok'} />
                  <Celda v={off ? '—' : fmt(d.current, 1)} nivel={nivel('corriente', d.current)} />
                  <Celda v={off ? '—' : fmt(d.outputVoltage, 0)} nivel={nivel('tension', d.outputVoltage)} />
                  <Celda v={cfw && !off ? fmt(d.frequency, 1) : '—'} nivel={cfw ? nivel('frecuencia', d.frequency) : 'ok'} />
                  <Celda v={off ? '—' : fmt(d.power, 1)} nivel="ok" />
                  <Celda v={cfw && !off ? fmt(d.torque || 0, 1) : '—'} nivel="ok" />
                  <Celda v={off ? '—' : fmt(temp, 1)} nivel={tNivel} />
                  <Celda v={cfw && !off ? fmt(d.dcLink || 0, 0) : '—'} nivel="ok" />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
})

function Celda({ v, nivel }: { v: string; nivel: 'ok' | 'warn' | 'bad' }) {
  const bg = nivel === 'bad' ? 'var(--p1)' : nivel === 'warn' ? 'var(--p3)' : undefined
  return (
    <td className="px-3 py-1.5">
      <span className="px-1" style={bg ? { background: bg, color: '#16191C' } : undefined}>{v}</span>
    </td>
  )
}
