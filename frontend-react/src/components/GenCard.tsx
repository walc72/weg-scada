import { memo } from 'react'
import { Zap } from 'lucide-react'
import { Card } from './ui/card'
import { Alarmas, SinLectura, Chip, bordeCampo, fmt, fmtMed, puntosLibres } from './CampoBase'
import { estadoGen, modoDe, modoTexto, promedio, VLL, VLN } from '../lib/generador'
import type { CampoState, CampoConfig, Punto } from '../types'
import VerEnUnifilar from './unifilar/VerEnUnifilar'

// Mediciones libres del mapa DSE por grupo (por nombre; las que no estén acá van a «Otras mediciones»)
const MOTOR = ['Presión de aceite', 'Temperatura refrigerante', 'Tensión de batería', 'Tensión alternador de carga', 'Nivel de combustible']
const RED = ['Frecuencia de red', 'Tensión de red L1-N']
const GEN = ['Potencia aparente']
const CONTADORES = ['Energía generada']
const CONOCIDAS = new Set([...MOTOR, ...RED, ...GEN, ...CONTADORES])

const extra = (st: CampoState | undefined, nombre: string) => st?.extras?.[nombre] ?? null

function Dato({ label, valor }: { label: string; valor: string }) {
  return <div className="min-w-0"><div className="font-sans text-[10px] text-muted-foreground tracking-widest truncate">{label}</div><div className="whitespace-nowrap">{valor}</div></div>
}

// Grupo electrógeno: estado (ISA-101: color solo en marcha/alarma/sin comunicación), modo y lo principal
export default memo(function GenCard({ st, cfg, onOpen }: { st?: CampoState; cfg: CampoConfig; onOpen?: () => void }) {
  const e = estadoGen(st)
  const live = !!st?.online && st.license !== 'excedido'
  const v = st?.valores ?? {}
  return (
    <Card className={`h-full flex flex-col ${onOpen ? 'cursor-pointer hover:bg-muted/30' : ''}`} onClick={onOpen} style={bordeCampo(live, e.id === 'falla')}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-5 w-5 text-muted-foreground shrink-0" />
          <span className="font-bold text-[15px] tracking-wide truncate min-w-0" title={cfg.name}>{cfg.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">{cfg.modelo}</span>
          <VerEnUnifilar equipo={cfg.name} />
        </div>
        <Chip tono={e.tono} blink={e.id === 'falla'}>{e.texto}</Chip>
      </div>
      {live ? (
        <div className="p-3 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-muted-foreground tracking-widest">MODO <span className="text-foreground font-semibold">{modoTexto(st?.modelo, modoDe(st))}</span></span>
            <span className="font-mono text-2xl font-medium tabular-nums">{fmt(v.kw, 0, 'kW')}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono text-[13px] tabular-nums border-t pt-2">
            {/* Sin tensiones de línea (ComAp IL4 solo publica fase-neutro): se muestra L-N */}
            {promedio(v, VLL) == null && promedio(v, VLN) != null
              ? <Dato label="TENSIÓN L-N" valor={fmt(promedio(v, VLN), 0, 'V')} />
              : <Dato label="TENSIÓN L-L" valor={fmt(promedio(v, VLL), 0, 'V')} />}
            <Dato label="FRECUENCIA" valor={fmt(v.hz, 1, 'Hz')} />
            <Dato label="BATERÍA" valor={fmt(extra(st, 'Tensión de batería'), 1, 'V')} />
            <Dato label="COMBUSTIBLE" valor={fmt(extra(st, 'Nivel de combustible'), 0, '%')} />
            <Dato label="HORAS" valor={fmt(v.horas, 0, 'h')} />
            <Dato label="ARRANQUES" valor={fmt(v.arranques, 0)} />
          </div>
          <Alarmas st={st} />
        </div>
      ) : <SinLectura st={st} />}
    </Card>
  )
})

function Grupo({ titulo, filas }: { titulo: string; filas: [string, string][] }) {
  if (!filas.length) return null
  return (
    <section className="bg-card border">
      <header className="px-3 py-2 border-b"><h2 className="text-xs font-bold tracking-widest">{titulo}</h2></header>
      <dl className="p-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px]">
        {filas.map(([k, val]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono text-right tabular-nums">{val}</dd></div>)}
      </dl>
    </section>
  )
}

// Detalle por grupo: generador, red, motor, contadores y lo que el mapa tenga de más
export function GenDetalle({ st, cfg }: { st?: CampoState; cfg: CampoConfig }) {
  const live = !!st?.online && st.license !== 'excedido'
  const v = st?.valores ?? {}
  const meds = puntosLibres(cfg).meds
  const med = (p: Punto): [string, string] => [p.nombre!, live ? fmtMed(st, p) : '—']
  const de = (nombres: string[]) => meds.filter(p => nombres.includes(p.nombre!)).map(med)
  const val = (x: unknown, dec: number, u: string) => (live ? fmt(x as number, dec, u) : '—')
  const fases = (keys: string[], labels: string[], u: string): [string, string][] => keys.map((k, i) => [labels[i], val(v[k], 0, u)])
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      <Grupo titulo="GENERADOR" filas={[
        ...fases(VLN, ['V L1-N', 'V L2-N', 'V L3-N'], 'V'), ...fases(VLL, ['V L1-L2', 'V L2-L3', 'V L3-L1'], 'V'),
        ...fases(['il1', 'il2', 'il3'], ['I L1', 'I L2', 'I L3'], 'A'),
        ['Potencia activa', val(v.kw, 0, 'kW')], ...de(GEN), ['Factor de potencia', val(v.fp, 2, '')], ['Frecuencia', val(v.hz, 1, 'Hz')],
      ]} />
      <Grupo titulo="RED" filas={de(RED)} />
      <Grupo titulo="MOTOR" filas={[['Velocidad', val(v.rpm, 0, 'rpm')], ...de(MOTOR)]} />
      <Grupo titulo="CONTADORES" filas={[['Horas de marcha', val(v.horas, 0, 'h')], ['Arranques', val(v.arranques, 0, '')], ...de(CONTADORES)]} />
      <Grupo titulo="OTRAS MEDICIONES" filas={meds.filter(p => !CONOCIDAS.has(p.nombre!)).map(med)} />
    </div>
  )
}
