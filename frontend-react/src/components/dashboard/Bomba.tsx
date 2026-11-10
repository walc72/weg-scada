import { Link } from 'react-router'
import { useConfigStore } from '../../store/config'
import DriveCard from '../DriveCard'
import { useDatosDashboard, type GadgetProps } from './GadgetMarco'

type Op = { bomba: string; vista: 'completa' | 'compacta'; campos: string[] }
const fmt = (v: number | null | undefined, dec = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: dec }))

// Una bomba elegida: la tarjeta de Equipos o una versión compacta con los valores elegidos. Clic → detalle.
export default function Bomba({ opciones }: GadgetProps<Op>) {
  const { driveList, daily } = useDatosDashboard()
  const gaugeZones = useConfigStore(s => s.config?.gaugeZones)
  const d = driveList.find(x => x.name === opciones.bomba)
  if (!opciones.bomba) return <p className="text-sm text-muted-foreground">Elegí la bomba en PERSONALIZAR → ⚙.</p>
  if (!d) return <p className="text-sm text-muted-foreground">Esta bomba ya no existe.</p>
  const dia = daily.get(d.name)
  const href = `/motor/${encodeURIComponent(d.name)}`

  if (opciones.vista === 'completa') return (
    <Link to={href} className="block" aria-label={`Detalle de ${d.displayName || d.name}`}>
      <DriveCard d={d} gaugeZones={gaugeZones ?? {}} energyKwh={dia?.energyKwh} maxPowerKw={dia?.maxPowerKw ?? undefined} opHoursToday={dia?.opHours ?? undefined} />
    </Link>
  )

  const on = d.online
  // ISA-101: el estado normal va en gris; solo falla / alarma / sin comunicación se destacan
  const estado = !on ? { txt: 'SIN COMUNICACIÓN', st: { color: 'var(--st-com)' } }
    : d.hasFault ? { txt: 'FALLA', st: { background: 'var(--p1)', color: '#16191C' } }
    : d.hasAlarm ? { txt: 'ALARMA', st: { background: 'var(--p3)', color: '#16191C' } }
    : { txt: d.running ? 'EN MARCHA' : 'DETENIDA', st: undefined }
  const valores: [string, string, string, string][] = [
    ['corriente', 'CORRIENTE', on ? fmt(d.current) : '—', 'A'],
    ['potencia', 'POTENCIA', on ? fmt(d.power) : '—', 'kW'],
    ['frecuencia', 'FRECUENCIA', on && d.type !== 'SSW900' ? fmt(d.frequency) : '—', 'Hz'],
    ['horas', 'MARCHA HOY', fmt(dia?.opHours), 'h'],
    ['energia', 'ENERGÍA HOY', fmt(dia?.energyKwh, 0), 'kWh'],
  ]
  return (
    <Link to={href} className="block border rounded-sm p-3 hover:bg-muted/40" style={on ? undefined : { borderStyle: 'dashed', borderColor: 'var(--st-com)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold truncate">{d.displayName || d.name}</span>
        {opciones.campos.includes('estado') && <span className="text-[11px] font-semibold tracking-wider px-1 whitespace-nowrap" style={estado.st}>{estado.txt}</span>}
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
        {valores.filter(([k]) => opciones.campos.includes(k)).map(([k, etq, v, u]) => (
          <div key={k} className="min-w-0">
            <div className="text-[11px] text-muted-foreground tracking-wider truncate">{etq}</div>
            <div className="font-mono text-lg font-medium tabular-nums leading-tight">{v}{v !== '—' && <span className="text-xs font-normal text-muted-foreground ml-1">{u}</span>}</div>
          </div>
        ))}
      </div>
    </Link>
  )
}
