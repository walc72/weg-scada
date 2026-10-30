import { memo } from 'react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { EstadoConexion, Alarmas, SinLectura, LibresPrincipales, fmt } from './CampoBase'
import type { CampoState, CampoConfig } from '../types'
import { Gauge } from 'lucide-react'
import VerEnUnifilar from './unifilar/VerEnUnifilar'

const si = (x: number | boolean | null | undefined, a: string, b: string) =>
  x === 1 || x === true ? a : x === 0 || x === false ? b : '—'

export default memo(function RegCard({ st, cfg, onOpen }: { st?: CampoState; cfg: CampoConfig; onOpen?: () => void }) {
  const v = st?.valores ?? {}
  const live = !!st?.online && st.license !== 'excedido'
  const min = cfg.tapMin ?? -16, max = cfg.tapMax ?? 16
  const tap = typeof v.tap === 'number' ? v.tap : null
  const pct = tap == null ? 0 : Math.min(100, Math.max(0, ((tap - min) / (max - min)) * 100))
  const alarma = live && Object.keys(st!.alarmas).length > 0
  return (
    <Card className={`border-l-4 ${onOpen ? 'cursor-pointer hover:bg-muted/30' : ''}`} onClick={onOpen} style={{ borderLeftColor: !live ? '#9ca3af' : alarma ? '#dc2626' : '#16a34a' }}>
      <div className="flex items-start justify-between gap-x-3 gap-y-1 flex-wrap p-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="h-5 w-5 text-primary shrink-0" />
          <span className="font-bold text-base break-words">{cfg.name}</span>
          <VerEnUnifilar equipo={cfg.name} />
          <Badge variant="secondary" className="shrink-0">{cfg.modelo}</Badge>
        </div>
        <EstadoConexion st={st} />
      </div>
      <div className="border-b" />
      {live ? (
        <>
          <div className="p-4">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">Tap</div>
            <div className="text-3xl font-bold tabular-nums">{fmt(tap)}</div>
            <div className="mt-2 h-2 rounded bg-muted relative">
              <div className="absolute inset-y-0 w-1 -ml-0.5 rounded bg-primary" style={{ left: `${pct}%`, display: tap == null ? 'none' : undefined }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums"><span>{min}</span><span>{max}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 pb-3 text-sm tabular-nums">
            <div><div className="text-[11px] uppercase text-muted-foreground">Tensión</div><div className="font-semibold">{fmt(v.v, 0, 'V')}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground">Corriente</div><div className="font-semibold">{fmt(v.i, 0, 'A')}</div></div>
            <div><div className="text-[11px] uppercase text-muted-foreground">Consigna</div><div className="font-semibold">{fmt(v.vConsigna, 0, 'V')}</div></div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <Badge variant="secondary">{si(v.auto, 'Auto', 'Manual')}</Badge>
            <Badge variant="secondary">{si(v.remoto, 'Remoto', 'Local')}</Badge>
          </div>
          <LibresPrincipales st={st} cfg={cfg} />
          <Alarmas st={st} />
        </>
      ) : <SinLectura st={st} />}
    </Card>
  )
})
