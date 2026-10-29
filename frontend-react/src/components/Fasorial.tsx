import { cn } from '@/lib/utils'
import { fmt, puntosLibres } from './CampoBase'
import type { CampoConfig, CampoState } from '../types'

export interface EquipoFasor {
  nombre: string; color: string; angulo: number | null
  fase: number  // posición de la fase (0/−120/120° según el orden); el vector va a fase + desfase
  fp?: number | null; kw?: number | null; kvar?: number | null
}

// Paleta fija por índice de equipo
export const FASOR_COLORES = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16']

const FASES = [0, -120, 120]

// Reguladores agrupados por banco, en el orden de la lista; los sin banco van juntos en un grupo sin nombre
export function porBanco(regs: CampoConfig[]): { banco?: string; regs: CampoConfig[] }[] {
  const out: { banco?: string; regs: CampoConfig[] }[] = []
  for (const r of regs) {
    const g = out.find(x => x.banco === r.banco)
    if (g) g.regs.push(r); else out.push({ banco: r.banco, regs: [r] })
  }
  return out
}

// Desfase en −180..180 (el RUA-01 manda 0..360: 350° = −10°)
const norm = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180

// Equipos para el fasorial: solo los con una med de rol «angulo» (desfase V–I); offline → sin valores.
// La fase sale del orden entre esos equipos: 1.º 0°, 2.º −120°, 3.º 120°.
export function fasorEquipos(regs: CampoConfig[], campo: Map<string, CampoState>): EquipoFasor[] {
  let k = 0
  return regs.flatMap((c, i) => {
    const meds = puntosLibres(c).meds
    if (!meds.some(m => m.rol === 'angulo')) return []
    const st = campo.get(c.name)
    const ex = st?.online ? st.extras : undefined
    const val = (rol: string) => { const p = meds.find(m => m.rol === rol); return p ? (ex?.[p.nombre!] ?? null) : undefined }
    const ang = val('angulo') ?? null
    return [{ nombre: c.name, color: FASOR_COLORES[i % FASOR_COLORES.length], fase: FASES[k++ % 3], angulo: ang == null ? null : norm(ang), fp: val('fp'), kw: val('kw'), kvar: val('kvar') }]
  })
}

// Diagrama fasorial: 0° a la derecha, sentido antihorario; por equipo, la fase punteada y el vector
// en fase + desfase V–I (largo unitario)
// `lado`: tabla a la derecha del diagrama (en vez de debajo)
export default function Fasorial({ equipos, size = 220, lado = false }: { equipos: EquipoFasor[]; size?: number; lado?: boolean }) {
  const c = size / 2, r = c - 22
  const pt = (deg: number, k = 1) => {
    const a = (deg * Math.PI) / 180
    return [c + r * k * Math.cos(a), c - r * k * Math.sin(a)]
  }
  const conFp = equipos.some(e => e.fp !== undefined), conKw = equipos.some(e => e.kw !== undefined), conKvar = equipos.some(e => e.kvar !== undefined)
  return (
    <div className={lado ? 'flex flex-wrap items-center justify-center gap-6' : 'flex flex-col items-center gap-2'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-muted-foreground" role="img" aria-label="Diagrama fasorial">
        <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeOpacity={0.4} />
        <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="currentColor" strokeOpacity={0.25} />
        <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="currentColor" strokeOpacity={0.25} />
        {([[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']] as const).map(([d, t]) => {
          const [x, y] = pt(d, 1.12)
          return <text key={d} x={x} y={y} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill="currentColor">{t}</text>
        })}
        {equipos.map(e => {
          const [fx, fy] = pt(e.fase)
          const ref = <line x1={c} y1={c} x2={fx} y2={fy} stroke={e.color} strokeOpacity={0.5} strokeDasharray="3 3" />
          if (e.angulo == null || !isFinite(e.angulo)) return <g key={e.nombre}>{ref}</g>
          const [x, y] = pt(e.fase + e.angulo)
          return <g key={e.nombre}>{ref}<line x1={c} y1={c} x2={x} y2={y} stroke={e.color} strokeWidth={2.5} strokeLinecap="round" /></g>
        })}
        <circle cx={c} cy={c} r={2.5} fill="currentColor" />
      </svg>
      <table className={cn('tabular-nums', lado ? 'text-lg font-semibold border-separate border-spacing-y-2' : 'text-xs')}>
        <thead>
          <tr className={cn('text-muted-foreground', lado && 'text-xs font-normal')}>
            <th className="text-left pr-3 font-medium">Equipo</th><th className="px-2 font-medium">Desfase V–I</th>
            {conFp && <th className="px-2 font-medium">FP</th>}{conKw && <th className="px-2 font-medium">kW</th>}{conKvar && <th className="px-2 font-medium">kVAr</th>}
          </tr>
        </thead>
        <tbody>
          {equipos.map(e => (
            <tr key={e.nombre}>
              <td className={cn('pr-3', lado && 'text-xs font-normal text-muted-foreground')}><span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: e.color }} />{e.nombre}</td>
              <td className="px-2 text-right">{fmt(e.angulo, 1, '°')}</td>
              {conFp && <td className="px-2 text-right">{fmt(e.fp, 2)}</td>}
              {conKw && <td className="px-2 text-right">{fmt(e.kw, 0)}</td>}
              {conKvar && <td className="px-2 text-right">{fmt(e.kvar, 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
