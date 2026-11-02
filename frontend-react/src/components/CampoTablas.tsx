import type { CampoState, CampoConfig } from '../types'
import { Chip, EstadoConexion, fmt, num } from './CampoBase'
import { volt } from './Mimico'
import { regDatos, pctTap } from './RegCard'
import { recoDatos, VIDA_MIN } from './RecoCard'

// Tablas compactas de Equipos: una fila por equipo, columnas de ancho fijo
// (nada se mueve cuando cambian los valores). Tocar una fila abre el detalle.
const th = 'text-left font-medium px-3 py-2 border-b whitespace-nowrap'
const td = 'px-3 py-2 align-middle'
const fila = 'border-b border-border/60 cursor-pointer hover:bg-accent/40'
const marca = (alarma: boolean, caido: boolean) =>
  caido ? { boxShadow: 'inset 4px 0 0 var(--st-com)' } : alarma ? { boxShadow: 'inset 4px 0 0 var(--p1)' } : undefined

function Nombre({ cfg, color }: { cfg: CampoConfig; color?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {color && <span className="h-2.5 w-2.5 shrink-0" style={{ background: color }} />}
      <span className="font-semibold truncate" title={cfg.name}>{cfg.name}</span>
      <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">{cfg.modelo}</span>
    </div>
  )
}

// Mini escala de TAP: neutro, recorrido memorizado y posición
function MiniTap({ d }: { d: ReturnType<typeof regDatos> }) {
  const { min, max, tap, tapMinMem, tapMaxMem, enLimite } = d
  return (
    <div className="relative h-2 w-full border" style={{ background: 'var(--bar-track)' }} title={`Escala ${min} a +${max}`}>
      {tapMinMem != null && tapMaxMem != null && (
        <div className="absolute inset-y-0" style={{ left: `${pctTap(tapMinMem, min, max)}%`, width: `${pctTap(tapMaxMem, min, max) - pctTap(tapMinMem, min, max)}%`, background: 'var(--bar-band)' }} />
      )}
      <div className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/50" style={{ left: `${pctTap(0, min, max)}%` }} />
      {tap != null && <div className="absolute -top-1 -bottom-1 w-1 -ml-0.5" style={{ left: `${pctTap(tap, min, max)}%`, background: enLimite ? 'var(--p3)' : 'hsl(var(--foreground))' }} />}
    </div>
  )
}

export function RegTabla({ regs, campo, colores, onOpen }: {
  regs: CampoConfig[]; campo: Map<string, CampoState>; colores?: string[]; onOpen: (name: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] table-fixed border-collapse text-[13px]">
        <thead>
          <tr className="text-[11px] tracking-wider text-muted-foreground">
            <th scope="col" className={`${th} w-[19%]`}>REGULADOR</th>
            <th scope="col" className={`${th} w-[120px]`}>MODO</th>
            <th scope="col" className={`${th} w-[150px]`}>TAP</th>
            <th scope="col" className={`${th} w-[130px] text-right`}>CARGA</th>
            <th scope="col" className={`${th} text-right`}>FUENTE</th>
            <th scope="col" className={`${th} text-right`}>CORRIENTE</th>
            <th scope="col" className={`${th} text-right`}>CONSIGNA</th>
            <th scope="col" className={`${th} w-[22%]`}>ESTADO</th>
          </tr>
        </thead>
        <tbody>
          {regs.map((cfg, i) => {
            const st = campo.get(cfg.name)
            const d = regDatos(st, cfg)
            const nAl = d.live ? Object.keys(st!.alarmas).length : 0
            return (
              <tr key={cfg.name} className={fila} style={marca(nAl > 0, !d.live)} onClick={() => onOpen(cfg.name)}>
                <td className={td}><Nombre cfg={cfg} color={colores?.[i % colores.length]} /></td>
                {!d.live ? <td className={td} colSpan={7}><EstadoConexion st={st} /></td> : <>
                  <td className={td}>
                    <span className="text-[11px] font-bold tracking-wider" style={d.manual ? { color: 'var(--p3-text)' } : undefined}>{d.v.auto == null ? '—' : d.manual ? 'MANUAL' : 'AUTO'}</span>
                    <span className="text-[11px] text-muted-foreground"> · {d.v.remoto === 1 || d.v.remoto === true ? 'REM' : d.v.remoto === 0 || d.v.remoto === false ? 'LOC' : '—'}</span>
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums w-11 text-right shrink-0">
                        {d.sube && <span className="blink text-[10px]">▲</span>}{d.baja && <span className="blink text-[10px]">▼</span>}
                        {d.tap == null ? '—' : d.tap > 0 ? `+${d.tap}` : d.tap}
                      </span>
                      <MiniTap d={d} />
                    </div>
                  </td>
                  <td className={`${td} text-right font-mono tabular-nums`}>
                    <span className="px-1" style={d.fuera ? { background: 'var(--p3)', color: '#16191C' } : undefined}>{volt(d.carga)}</span>
                    {d.desvio != null && <div className="text-[10px] text-muted-foreground">{d.desvio >= 0 ? '+' : ''}{num(d.desvio, 1)} %</div>}
                  </td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{volt(d.fuente)}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{fmt(d.v.i, 0, 'A')}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{volt(d.consigna)}</td>
                  <td className={td}>
                    <div className="flex gap-1 overflow-hidden whitespace-nowrap">
                      {(d.enRango != null || d.sobre != null || d.bajo != null) && (
                        <Chip tono={d.fuera ? 'p3' : 'off'}>{d.sobre ? 'SOBRE' : d.bajo ? 'BAJO' : d.fuera ? 'FUERA' : 'EN RANGO'}</Chip>
                      )}
                      {d.enLimite && <Chip tono="p3">TAP LÍMITE</Chip>}
                      {nAl > 0 && <Chip tono="p1">{nAl} ALARMA{nAl > 1 ? 'S' : ''}</Chip>}
                    </div>
                  </td>
                </>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RecoTabla({ recos, campo, onOpen }: { recos: CampoConfig[]; campo: Map<string, CampoState>; onOpen: (name: string) => void }) {
  return (
    <section aria-label="Reconectadores" className="bg-card border overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed border-collapse text-[13px]">
        <thead>
          <tr className="text-[11px] tracking-wider text-muted-foreground">
            <th scope="col" className={`${th} w-[20%]`}>RECONECTADOR</th>
            <th scope="col" className={`${th} w-[130px]`}>ESTADO</th>
            <th scope="col" className={`${th} w-[19%]`}>PROTECCIÓN</th>
            <th scope="col" className={`${th} text-right`}>Ia A</th>
            <th scope="col" className={`${th} text-right`}>Ib A</th>
            <th scope="col" className={`${th} text-right`}>Ic A</th>
            <th scope="col" className={`${th} text-right`}>kV</th>
            <th scope="col" className={`${th} text-right`}>OPERAC.</th>
            <th scope="col" className={`${th} text-right`}>VIDA</th>
          </tr>
        </thead>
        <tbody>
          {recos.map(cfg => {
            const st = campo.get(cfg.name)
            const d = recoDatos(st)
            const nAl = d.live ? Object.keys(st!.alarmas).length : 0
            const vs = (['a', 'b', 'c'] as const).map(f => d.v['v' + f]).filter((x): x is number => typeof x === 'number')
            return (
              <tr key={cfg.name} className={fila} style={marca(nAl > 0 || d.e === 'disparo', !d.live)} onClick={() => onOpen(cfg.name)}>
                <td className={td}><Nombre cfg={cfg} /></td>
                {!d.live ? <td className={td} colSpan={8}><EstadoConexion st={st} /></td> : <>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={d.e === 'disparo' ? 'blink' : undefined}>
                        <rect x="2" y="2" width="12" height="12" style={{ fill: d.sym.fill, stroke: d.sym.stroke, strokeWidth: 2 }} />
                      </svg>
                      <span className="text-[11px] font-bold tracking-wider" style={d.e === 'disparo' ? { color: 'var(--p1-text)' } : undefined}>{d.sym.txt}</span>
                    </div>
                  </td>
                  <td className={td}>
                    <div className="flex gap-1 overflow-hidden whitespace-nowrap">
                      {d.proteccion != null && <Chip tono={d.proteccion ? 'off' : 'p3'}>{d.proteccion ? 'PROT.' : 'SIN PROT.'}</Chip>}
                      {d.recierre != null && <Chip tono={d.recierre ? 'off' : 'p3'}>{d.recierre ? 'RECIERRE' : 'SIN RECIERRE'}</Chip>}
                      {d.bloqueado && <Chip tono="p2">BLOQ.</Chip>}
                    </div>
                  </td>
                  {(['a', 'b', 'c'] as const).map(f => <td key={f} className={`${td} text-right font-mono tabular-nums`}>{fmt(d.v['i' + f], 0)}</td>)}
                  <td className={`${td} text-right font-mono tabular-nums`}>{vs.length ? fmt(vs.reduce((a, b) => a + b, 0) / vs.length / 1000, 2) : '—'}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>{fmt(d.v.operaciones)}</td>
                  <td className={`${td} text-right font-mono tabular-nums`}>
                    {d.vida == null ? '—' : <span className="px-1" style={d.vida < VIDA_MIN ? { background: 'var(--p3)', color: '#16191C' } : undefined}>{fmt(d.vida, 0)} %</span>}
                  </td>
                </>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
