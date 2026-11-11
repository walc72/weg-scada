import { useConfigStore } from '../../store/config'
import { useDrivesStore } from '../../store/drives'
import { useNow } from '@/lib/useNow'
import { isStale } from '@/lib/stale'
import { colectorLabel, fmtFlow, volumenCorto } from '@/lib/flow'
import type { GadgetProps } from './GadgetMarco'

type Op = { caudalimetros: string[] | null; columnas: string[]; unidad: 'lps' | 'm3h' }
const nf = (v: number | null | undefined, dec = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: dec }))

// Caudalímetros en vivo (MQTT): caudal, totalizador y estado; `caudalimetros` null = todos los habilitados
export default function Caudales({ opciones }: GadgetProps<Op>) {
  const cfg = useConfigStore(s => s.config?.flowmeters)
  const estados = useDrivesStore(s => s.flowmeters)
  const ahora = useNow()
  const { caudalimetros, columnas, unidad } = opciones
  const lista = (cfg ?? []).filter(f => f.enabled !== false && (!caudalimetros || caudalimetros.includes(f.name)))
  if (lista.length === 0) return <p className="text-sm text-muted-foreground">No hay caudalímetros para mostrar.</p>
  const col = (k: string) => columnas.includes(k)
  const th = 'py-1.5 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className={th}>CAUDALÍMETRO</th>
            {col('caudal') && <th className={`${th} text-right`}>CAUDAL {unidad === 'm3h' ? 'm³/h' : 'L/s'}</th>}
            {col('total') && <th className={`${th} text-right`}>TOTALIZADOR</th>}
            {col('estado') && <th className={th}>ESTADO</th>}
          </tr>
        </thead>
        <tbody>
          {lista.map(f => {
            const s = estados.get(f.name)
            const ok = !!s?.online && !s.error
            const viejo = ok && isStale(s?.ts, ahora)
            const caudal = ok ? s?.flow : null
            // ISA-101: normal sin color; sin comunicación / error destacados
            const est = !s?.online ? { txt: s?.sinEnlace ? `SIN ENLACE (${s.sinEnlace})` : 'SIN COMUNICACIÓN', st: { color: 'var(--st-com)' } }
              : s.error ? { txt: `ERROR ${s.error}`, st: { background: 'var(--p3)', color: '#16191C' } }
              : { txt: viejo ? 'SIN ACTUALIZAR' : 'NORMAL', st: viejo ? { color: 'hsl(var(--muted-foreground))' } : undefined }
            return (
              <tr key={f.name} className="border-b border-border last:border-0">
                <td className="py-1.5 px-2 truncate max-w-[220px]" title={f.name}>{f.bombas.length > 1 ? colectorLabel(f.name) : f.name}</td>
                {col('caudal') && <td className={`py-1.5 px-2 text-right font-mono tabular-nums ${viejo ? 'text-muted-foreground' : ''}`}>
                  {unidad === 'm3h' ? nf(caudal, 1) : fmtFlow(caudal)}</td>}
                {col('total') && <td className="py-1.5 px-2 text-right font-mono tabular-nums">{(() => { const v = ok ? volumenCorto(s?.total) : null; return v ? <>{nf(v.valor, v.dec)} <span className="text-[11px] text-muted-foreground">{v.unidad}</span></> : '—' })()}</td>}
                {col('estado') && <td className="py-1.5 px-2"><span className="text-[11px] font-semibold tracking-wider px-1 whitespace-nowrap" style={est.st}>{est.txt}</span></td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
