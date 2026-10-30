import { memo } from 'react'
import { Card } from './ui/card'
import { EstadoConexion, Alarmas, SinLectura, LibresPrincipales, fmt, num, Chip, bordeCampo, senalDe, medDe } from './CampoBase'
import { tensionCarga, volt } from './Mimico'
import type { CampoState, CampoConfig } from '../types'
import VerEnUnifilar from './unifilar/VerEnUnifilar'

const n = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : null)
const pct = (x: number, lo: number, hi: number) => Math.min(100, Math.max(0, ((x - lo) / (hi - lo || 1)) * 100))

// Regulador de tensión: TAP en su escala (neutro y recorrido memorizado),
// tensión de carga contra la consigna y estados (auto/manual, local/remoto,
// en rango, tap en límite). Gris mientras todo es normal.
export default memo(function RegCard({ st, cfg, onOpen }: { st?: CampoState; cfg: CampoConfig; onOpen?: () => void }) {
  const v = st?.valores ?? {}
  const live = !!st?.online && st.license !== 'excedido'
  const alarma = live && Object.keys(st!.alarmas).length > 0
  const min = cfg.tapMin ?? -16, max = cfg.tapMax ?? 16
  const tap = n(v.tap)
  const tapMaxMem = medDe(st, /tap m[aá]ximo/i), tapMinMem = medDe(st, /tap m[ií]nimo/i)
  const enLimite = tap != null && (tap <= min || tap >= max)
  const sube = senalDe(st, /elevando/i), baja = senalDe(st, /bajando/i)

  const carga = tensionCarga(cfg, st).v
  const fuente = medDe(st, /tensi[oó]n\s+fuente/i)
  const consigna = n(v.vConsigna)
  // La consigna de algunos equipos llega dudosa: solo se usa si queda a menos de ±20 % de la carga
  const desvio = carga != null && consigna && Math.abs(carga / consigna - 1) < 0.2 ? (carga / consigna - 1) * 100 : null
  const enRango = senalDe(st, /tensi[oó]n en rango/i)
  const sobre = senalDe(st, /sobre el rango/i), bajo = senalDe(st, /bajo el rango/i)
  const fuera = enRango === false || sobre === true || bajo === true
  const manual = v.auto === 0 || v.auto === false

  return (
    <Card className={onOpen ? 'cursor-pointer hover:bg-muted/30' : ''} onClick={onOpen} style={bordeCampo(live, alarma)}>
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
          <div className="flex flex-wrap gap-1.5">
            <Chip tono={manual ? 'p3' : 'off'}>{v.auto == null ? 'MODO —' : manual ? 'MANUAL' : 'AUTO'}</Chip>
            <Chip tono="info">{v.remoto === 1 || v.remoto === true ? 'REMOTO' : v.remoto === 0 || v.remoto === false ? 'LOCAL' : '—'}</Chip>
            {(enRango != null || sobre != null || bajo != null) && (
              <Chip tono={fuera ? 'p3' : 'off'}>{sobre ? 'SOBRE EL RANGO' : bajo ? 'BAJO EL RANGO' : fuera ? 'FUERA DE RANGO' : 'EN RANGO'}</Chip>
            )}
            {enLimite && <Chip tono="p3">TAP EN LÍMITE</Chip>}
          </div>

          {/* TAP */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted-foreground tracking-widest">TAP</span>
              <span className="font-mono text-2xl font-medium tabular-nums">
                {sube && <span className="blink text-base mr-1">▲</span>}
                {baja && <span className="blink text-base mr-1">▼</span>}
                {tap == null ? '—' : tap > 0 ? `+${tap}` : tap}
              </span>
            </div>
            <div className="relative h-2.5 mt-1.5 border" style={{ background: 'var(--bar-track)' }}>
              {tapMinMem != null && tapMaxMem != null && (
                <div className="absolute inset-y-0" style={{ left: `${pct(tapMinMem, min, max)}%`, width: `${pct(tapMaxMem, min, max) - pct(tapMinMem, min, max)}%`, background: 'var(--bar-band)' }} title={`Recorrido memorizado ${tapMinMem} a ${tapMaxMem}`} />
              )}
              <div className="absolute -top-1 -bottom-1 w-px bg-foreground/50" style={{ left: `${pct(0, min, max)}%` }} />
              {tap != null && <div className="absolute -top-1.5 -bottom-1.5 w-1 -ml-0.5" style={{ left: `${pct(tap, min, max)}%`, background: enLimite ? 'var(--p3)' : 'hsl(var(--foreground))' }} />}
            </div>
            <div className="flex justify-between mt-1 font-mono text-[10px] text-muted-foreground">
              <span>{min}</span>
              <span>{tapMinMem != null && tapMaxMem != null ? `recorrido ${tapMinMem} a +${tapMaxMem}` : '0'}</span>
              <span>+{max}</span>
            </div>
          </div>

          {/* Tensión de carga contra la consigna */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted-foreground tracking-widest">TENSIÓN CARGA</span>
              <span className="font-mono text-xl font-medium tabular-nums px-1" style={fuera ? { background: 'var(--p3)', color: '#16191C' } : undefined}>{volt(carga)}</span>
            </div>
            {desvio != null && (
              <>
                <div className="relative h-2.5 mt-1.5 border" style={{ background: 'var(--bar-track)' }}>
                  <div className="absolute -top-1 -bottom-1 w-0.5 -ml-px" style={{ left: '50%', background: 'var(--lim)' }} title="Consigna" />
                  <div className="absolute -top-1.5 -bottom-1.5 w-1 -ml-0.5" style={{ left: `${pct(desvio, -5, 5)}%`, background: fuera ? 'var(--p3)' : 'hsl(var(--foreground))' }} />
                </div>
                <div className="flex justify-between mt-1 font-mono text-[10px] text-muted-foreground">
                  <span>−5 %</span><span>consigna · {desvio >= 0 ? '+' : ''}{num(desvio, 1)} %</span><span>+5 %</span>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-[13px] tabular-nums border-t pt-2">
            <div><div className="font-sans text-[10px] text-muted-foreground tracking-widest">FUENTE</div>{volt(fuente)}</div>
            <div><div className="font-sans text-[10px] text-muted-foreground tracking-widest">CORRIENTE</div>{fmt(v.i, 0, 'A')}</div>
            <div><div className="font-sans text-[10px] text-muted-foreground tracking-widest">CONSIGNA</div>{volt(consigna)}</div>
          </div>
          <LibresPrincipales st={st} cfg={cfg} />
          <Alarmas st={st} />
        </div>
      ) : <SinLectura st={st} />}
    </Card>
  )
})
