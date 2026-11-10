// Gauge de arco (240°) con la misma lógica de zonas ISA-101 que la barra (`barra()` de HalfGauge):
// valor en gris oscuro mientras está en zona normal; ámbar / rojo solo fuera de zona; gris si es viejo.
import { memo } from 'react'
import { barra } from './HalfGauge'
import type { Zona } from '@/lib/gauges'

const FILL = { ok: 'var(--bar-fill)', warn: 'var(--p3)', bad: 'var(--p1)' } as const
const R = 44, CX = 60, CY = 58
const xy = (p: number) => {
  const a = ((150 + 2.4 * p) * Math.PI) / 180
  return [+(CX + R * Math.cos(a)).toFixed(2), +(CY + R * Math.sin(a)).toFixed(2)]
}
const punto = (p: number) => xy(p).join(' ')
// arco entre dos porcentajes de la escala
const arco = (p0: number, p1: number) => `M ${punto(p0)} A ${R} ${R} 0 ${(p1 - p0) * 2.4 > 180 ? 1 : 0} 1 ${punto(p1)}`
const fmt = (v: number, dec?: number) => v.toLocaleString('es-AR', { maximumFractionDigits: dec ?? (Math.abs(v) >= 100 ? 0 : 1), minimumFractionDigits: dec ?? 0 })

function ArcGauge({ valor, stale, label, equipo, unit, zona, sufijo, ancho = 'max-w-[180px]' }: {
  valor: number | null; stale: boolean; label: string; equipo: string; unit: string; zona: Zona; sufijo?: string
  ancho?: string // clase max-w-[…] literal (Tailwind solo genera las que ve escritas)
}) {
  const plain = zona.green === undefined || zona.yellow === undefined
  const b = barra({ value: valor ?? zona.min, min: zona.min, max: zona.max, redLow: zona.redLow, green: zona.green ?? zona.max, yellow: zona.yellow ?? zona.max, invert: zona.invert, bipolar: zona.bipolar })
  const sinDato = valor === null
  const nivel = sinDato || stale || plain ? 'ok' : b.nivel
  const marcas = !plain && !sinDato && !stale
  const color = stale ? 'var(--bar-stale)' : FILL[nivel]
  const min = zona.bipolar ? 0 : zona.min, max = zona.bipolar ? 1 : zona.max
  const dec = zona.bipolar ? 2 : undefined

  return (
    <div className="min-w-0 text-center" role="meter" aria-label={`${label} · ${equipo}`}
      aria-valuenow={valor ?? undefined} aria-valuemin={min} aria-valuemax={max}>
      <div className={`relative mx-auto ${ancho}`}>
        <svg viewBox="0 0 120 100" className="w-full block" aria-hidden>
          <path d={arco(0, 100)} fill="none" stroke="var(--bar-track)" strokeWidth={10} />
          {marcas && b.alerta.map(([a, c], i) => c > a && <path key={'a' + i} d={arco(a, c)} fill="none" stroke="var(--zona-alerta)" strokeWidth={10} />)}
          {marcas && b.alarma.map(([a, c], i) => c > a && <path key={'r' + i} d={arco(a, c)} fill="none" stroke="var(--zona-alarma)" strokeWidth={10} />)}
          {!sinDato && b.pos > 0 && <path d={arco(0, b.pos)} fill="none" stroke={color} strokeWidth={4} className="transition-all duration-500" />}
          {!sinDato && !stale && <circle cx={xy(b.pos)[0]} cy={xy(b.pos)[1]} r={4}
            fill={nivel === 'ok' ? 'hsl(var(--foreground))' : color} />}
          <text x={CX - R + 4} y={96} fontSize={9} textAnchor="middle" className="fill-muted-foreground font-mono">{fmt(min, dec)}</text>
          <text x={CX + R - 4} y={96} fontSize={9} textAnchor="middle" className="fill-muted-foreground font-mono">{fmt(max, dec)}</text>
        </svg>
        <div className="absolute inset-x-0 top-[40%] flex justify-center">
          <span className="font-mono text-xl font-medium leading-none tabular-nums whitespace-nowrap px-1"
            style={nivel === 'ok' ? { color: sinDato || stale ? 'hsl(var(--muted-foreground))' : undefined } : { background: color, color: '#16191C' }}>
            {valor === null ? "—" : fmt(sufijo ? Math.abs(valor) : valor, dec)}
            {sufijo && valor !== null && <span className="text-xs font-bold ml-1" title={sufijo === 'i' ? 'Inductivo (atraso)' : 'Capacitivo (adelanto)'}>{sufijo}</span>}
            {unit && <span className={`text-xs font-normal ml-1 ${nivel === 'ok' ? 'text-muted-foreground' : ''}`}>{unit}</span>}
          </span>
        </div>
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider truncate" title={label}>{label}</div>
      <div className="text-[11px] text-muted-foreground truncate" title={equipo}>{equipo}</div>
    </div>
  )
}

export default memo(ArcGauge)
