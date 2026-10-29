import { puntosLibres } from './CampoBase'
import { FASOR_COLORES } from './Fasorial'
import type { CampoConfig, CampoState } from '../types'

// Tensión de carga: la med «Tensión carga» si existe; si no, `v` del regulador
export function tensionCarga(c: CampoConfig, st?: CampoState): { v: number | null; dec: number; unidad: string } {
  const p = puntosLibres(c).meds.find(m => /tensi[oó]n\s+carga/i.test(m.nombre!))
  const v = p ? st?.extras?.[p.nombre!] : st?.valores?.v
  return { v: typeof v === 'number' ? v : null, dec: p?.decimales ?? 0, unidad: p?.unidad ?? 'V' }
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null)
const volt = (v: number | null) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} kV` : `${v.toFixed(0)} V`)
const senal = (st: CampoState | undefined, re: RegExp) => Object.entries(st?.senales ?? {}).some(([n, on]) => on && re.test(n))

const FILA = 70

// Mímico de un banco: por fase, tensión de fuente → regulador con TAP → tensión de carga.
// Flujo animado con la fase en línea y con corriente; ▲/▼ mientras el motor del cambiador se mueve.
export default function Mimico({ regs, campo }: { regs: CampoConfig[]; campo: Map<string, CampoState> }) {
  const h = regs.length * FILA + 20
  return (
    <svg viewBox={`0 0 640 ${h}`} className="flex-1 min-w-[300px] max-w-[560px] text-foreground" role="img" aria-label="Mímico del banco de reguladores">
      <style>{`
        @keyframes mimico-flujo { to { stroke-dashoffset: -20 } }
        @keyframes mimico-parpadeo { 50% { opacity: .2 } }
        .mimico-flujo { stroke-dasharray: 6 4; animation: mimico-flujo .8s linear infinite }
        .mimico-parpadeo { animation: mimico-parpadeo 1s steps(1) infinite }
        @media (prefers-reduced-motion: reduce) { .mimico-flujo, .mimico-parpadeo { animation: none } }
      `}</style>
      <text x={20} y={14} fontSize={12} fill="currentColor" opacity={0.6}>Fuente</text>
      <text x={545} y={14} fontSize={12} fill="currentColor" opacity={0.6}>Carga</text>
      {regs.map((c, k) => {
        const st = campo.get(c.name)
        const on = !!st?.online
        const color = on ? FASOR_COLORES[k % FASOR_COLORES.length] : 'currentColor'
        const fuenteP = puntosLibres(c).meds.find(m => /tensi[oó]n\s+fuente/i.test(m.nombre!))
        const fuente = on && fuenteP ? num(st?.extras?.[fuenteP.nombre!]) : null
        const carga = on ? tensionCarga(c, st).v : null
        const tap = on ? num(st?.valores?.tap) : null
        const flujo = on && (num(st?.valores?.i) ?? 0) > 0 ? 'mimico-flujo' : undefined
        const sube = on && senal(st, /elevando/i), baja = on && senal(st, /bajando/i)
        const elev = fuente && carga != null ? ((carga / fuente) - 1) * 100 : null
        return (
          <g key={c.name} transform={`translate(0, ${20 + k * FILA})`} opacity={on ? 1 : 0.45}>
            <circle cx={14} cy={30} r={5} fill={FASOR_COLORES[k % FASOR_COLORES.length]} />
            <text x={26} y={25} fontSize={12} fill="currentColor" opacity={0.6}>{c.name}</text>
            <text x={26} y={45} fontSize={18} fontWeight={600} fill="currentColor">{volt(fuente)}</text>
            <line x1={130} y1={30} x2={270} y2={30} stroke={color} strokeWidth={3} className={flujo} />
            <circle cx={300} cy={30} r={26} fill="none" stroke={color} strokeWidth={3} />
            <line x1={283} y1={47} x2={317} y2={13} stroke={color} strokeWidth={2.5} />
            <polygon points="317,13 307,15 315,23" fill={color} />
            <rect x={340} y={12} width={56} height={36} rx={4} fill="none" stroke="currentColor" strokeOpacity={sube || baja ? 0.9 : 0.3} />
            <text x={368} y={26} fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.6}>TAP</text>
            <text x={368} y={42} fontSize={15} fontWeight={600} textAnchor="middle" fill="currentColor">{tap == null ? '—' : tap > 0 ? `+${tap}` : tap}</text>
            {sube && <text x={402} y={22} fontSize={14} fill="currentColor" className="mimico-parpadeo">▲</text>}
            {baja && <text x={402} y={48} fontSize={14} fill="currentColor" className="mimico-parpadeo">▼</text>}
            <line x1={410} y1={30} x2={530} y2={30} stroke={color} strokeWidth={3} className={flujo} />
            <text x={545} y={28} fontSize={18} fontWeight={600} fill="currentColor">{volt(carga)}</text>
            {elev != null && <text x={545} y={45} fontSize={12} fill="currentColor" opacity={0.6}>{elev >= 0 ? '+' : ''}{elev.toFixed(1)} %</text>}
          </g>
        )
      })}
    </svg>
  )
}
