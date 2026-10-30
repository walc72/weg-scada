import { memo } from 'react'
import { Card } from './ui/card'
import { EstadoConexion, Alarmas, SinLectura, LibresPrincipales, fmt, Chip, bordeCampo, senalDe, medDe } from './CampoBase'
import { recoCerrado } from '../lib/reco'
import type { CampoState, CampoConfig } from '../types'
import VerEnUnifilar from './unifilar/VerEnUnifilar'

// Vida de contactos por debajo de este % se marca para mantenimiento
// ponytail: umbral fijo; pasarlo a la config del equipo si cada modelo pide otro
const VIDA_MIN = 20

// Reconectador: símbolo de interruptor (cerrado verde lleno, abierto vacío,
// disparo rojo intermitente), protección y recierre, corrientes/tensiones por
// fase y datos de mantenimiento.
export default memo(function RecoCard({ st, cfg, onOpen }: { st?: CampoState; cfg: CampoConfig; onOpen?: () => void }) {
  const v = st?.valores ?? {}
  const live = !!st?.online && st.license !== 'excedido'
  const e = st && live ? recoCerrado(st) : null
  const alarma = live && Object.keys(st!.alarmas).length > 0
  const bloqueado = live && (v.bloqueo === 1 || v.bloqueo === true || !!st?.alarmas.BLOQUEO)
  const proteccion = senalDe(st, /protecci[oó]n activa/i)
  const recierre = senalDe(st, /reconexi[oó]n autom/i)
  const tierra = medDe(st, /corriente de tierra/i)
  const vida = medDe(st, /vida de contactos/i)

  const sym = e === 'cerrado' ? { fill: 'var(--st-run)', stroke: 'var(--st-run)', txt: 'CERRADO', tono: 'run' as const }
    : e === 'disparo' ? { fill: 'var(--p1)', stroke: 'var(--p1)', txt: 'DISPARO', tono: 'p1' as const }
    : e === 'abierto' ? { fill: 'none', stroke: 'hsl(var(--muted-foreground))', txt: 'ABIERTO', tono: 'off' as const }
    : { fill: 'none', stroke: 'hsl(var(--muted-foreground))', txt: 'ESTADO —', tono: 'off' as const }

  return (
    <Card className={onOpen ? 'cursor-pointer hover:bg-muted/30' : ''} onClick={onOpen} style={bordeCampo(live, alarma || e === 'disparo')}>
      <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[15px] tracking-wide break-words">{cfg.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">{cfg.modelo}</span>
          <VerEnUnifilar equipo={cfg.name} />
        </div>
        {!live && <EstadoConexion st={st} />}
      </div>
      {live ? (
        <div className="p-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`Reconectador ${cfg.name}: ${sym.txt}`} className={e === 'disparo' ? 'blink' : undefined}>
              <rect x="6" y="6" width="32" height="32" style={{ fill: sym.fill, stroke: sym.stroke, strokeWidth: 2.5 }} />
            </svg>
            <div className="flex flex-col items-start gap-1.5">
              <Chip tono={sym.tono} blink={e === 'disparo'}>{sym.txt}</Chip>
              <div className="flex flex-wrap gap-1.5">
                {proteccion != null && <Chip tono={proteccion ? 'off' : 'p3'}>{proteccion ? 'PROTECCIÓN ACTIVA' : 'SIN PROTECCIÓN'}</Chip>}
                {recierre != null && <Chip tono={recierre ? 'off' : 'p3'}>{recierre ? 'RECIERRE ON' : 'RECIERRE OFF'}</Chip>}
                {bloqueado && <Chip tono="p2">BLOQUEADO</Chip>}
              </div>
            </div>
          </div>

          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[10px] tracking-widest text-muted-foreground">
                <th scope="col" className="text-left font-medium pb-1"></th>
                {['A', 'B', 'C'].map(f => <th key={f} scope="col" className="text-right font-medium pb-1">FASE {f}</th>)}
                {tierra != null && <th scope="col" className="text-right font-medium pb-1">TIERRA</th>}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              <tr className="border-t">
                <th scope="row" className="text-left font-sans text-[11px] font-medium text-muted-foreground py-1">Corriente A</th>
                {(['a', 'b', 'c'] as const).map(f => <td key={f} className="text-right">{fmt(v['i' + f], 0)}</td>)}
                {tierra != null && <td className="text-right">{fmt(tierra, 1)}</td>}
              </tr>
              <tr className="border-t">
                <th scope="row" className="text-left font-sans text-[11px] font-medium text-muted-foreground py-1">Tensión kV</th>
                {(['a', 'b', 'c'] as const).map(f => {
                  const x = v['v' + f]
                  return <td key={f} className="text-right">{typeof x === 'number' ? fmt(x / 1000, 2) : '—'}</td>
                })}
                {tierra != null && <td />}
              </tr>
            </tbody>
          </table>

          <div className="flex flex-wrap justify-between gap-2 border-t pt-2 font-mono text-[11px] text-muted-foreground">
            <span>OPERACIONES <span className="text-foreground">{fmt(v.operaciones)}</span></span>
            {vida != null && (
              <span>VIDA DE CONTACTOS{' '}
                <span className="px-1 text-foreground" style={vida < VIDA_MIN ? { background: 'var(--p3)', color: '#16191C' } : undefined}>{fmt(vida, 0)} %</span>
              </span>
            )}
          </div>
          <LibresPrincipales st={st} cfg={cfg} />
          <Alarmas st={st} />
        </div>
      ) : <SinLectura st={st} />}
    </Card>
  )
})
