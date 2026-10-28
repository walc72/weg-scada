import { memo } from 'react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { EstadoConexion, Alarmas, SinLectura, fmt } from './CampoBase'
import type { CampoState, CampoConfig } from '../types'
import { ToggleRight } from 'lucide-react'

// estado: 1 = cerrado, 0 = abierto; DISPARO activo manda sobre el estado
function estadoReco(st: CampoState) {
  if (st.alarmas.DISPARO) return { txt: 'Disparo', color: '#dc2626' }
  const e = st.valores.estado
  if (e === 1 || e === true) return { txt: 'Cerrado', color: '#16a34a' }
  if (e === 0 || e === false) return { txt: 'Abierto', color: '#6b7280' }
  return { txt: '—', color: '#6b7280' }
}

export default memo(function RecoCard({ st, cfg }: { st?: CampoState; cfg: CampoConfig }) {
  const v = st?.valores ?? {}
  const live = !!st?.online && st.license !== 'excedido'
  const e = st && live ? estadoReco(st) : null
  const bloqueado = live && (v.bloqueo === 1 || v.bloqueo === true || !!st?.alarmas.BLOQUEO)
  return (
    <Card className="border-l-4" style={{ borderLeftColor: e?.color ?? '#9ca3af' }}>
      <div className="flex items-start justify-between gap-x-3 gap-y-1 flex-wrap p-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <ToggleRight className="h-5 w-5 text-primary shrink-0" />
          <span className="font-bold text-base break-words">{cfg.name}</span>
          <Badge variant="secondary" className="shrink-0">{cfg.modelo}</Badge>
        </div>
        <EstadoConexion st={st} />
      </div>
      <div className="border-b" />
      {live && e ? (
        <>
          <div className="p-4 flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-bold" style={{ color: e.color }}>{e.txt}</span>
            {bloqueado && <Badge variant="secondary" className="font-bold text-red-600">Bloqueado</Badge>}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">Operaciones: {fmt(v.operaciones)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 pb-4 text-sm tabular-nums">
            {(['a', 'b', 'c'] as const).map(f => (
              <div key={f}>
                <div className="text-[11px] font-medium uppercase text-muted-foreground">Fase {f.toUpperCase()}</div>
                <div className="font-semibold">{fmt(v['i' + f], 0, 'A')}</div>
                <div className="text-muted-foreground">{fmt(v['v' + f], 0, 'V')}</div>
              </div>
            ))}
          </div>
          <Alarmas st={st} />
        </>
      ) : <SinLectura st={st} />}
    </Card>
  )
})
