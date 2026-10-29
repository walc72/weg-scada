import { fmt, puntosLibres, Luz } from '../CampoBase'
import { fasesDeBanco } from '../../lib/energizar'
import type { Vivos } from '../../lib/energizar'
import { isStale } from '../../lib/stale'
import type { Nodo } from '../../lib/unifilar'
import type { CampoConfig, CampoState, Drive, Meter } from '../../types'

// Equipo de Configuración + su estado en vivo al que apunta un nodo (spec §2.2)
export interface Equipo {
  existe: boolean  // el ref/banco está en la config (si no: «equipo no encontrado»)
  nombre: string
  campos: { cfg: CampoConfig; st?: CampoState }[] // reco/reg suelto: 1; banco: una por fase
  meter?: Meter
  drive?: Drive
}

export function equipoDe(n: Nodo, v: Vivos): Equipo {
  const nombre = n.banco ?? n.ref ?? ''
  const c = v.config
  const campo = (lista?: CampoConfig[]) => {
    const cfg = n.banco != null ? fasesDeBanco(c, n.banco) : (lista ?? []).filter(x => x.name === n.ref)
    return cfg.map(x => ({ cfg: x, st: v.campo.get(x.name) }))
  }
  switch (n.tipo) {
    case 'reco': { const campos = campo(c.reconectadores); return { existe: campos.length > 0, nombre, campos } }
    case 'reg': { const campos = campo(c.reguladores); return { existe: campos.length > 0, nombre, campos } }
    case 'medidor': return { existe: c.meters.some(m => m.name === n.ref), nombre, campos: [], meter: v.meters.get(nombre) }
    case 'bomba': return { existe: c.devices.some(d => d.name === n.ref), nombre, campos: [], drive: v.drives.get(nombre) }
    case 'caudalimetro': return { existe: !!c.flowmeters?.some(f => f.name === n.ref), nombre, campos: [] }
    case 'comm': return { existe: !!c.comms?.some(x => x.name === n.ref), nombre, campos: [] }
    default: return { existe: true, nombre, campos: [] }
  }
}

// Keys fijas por tipo: [etiqueta, unidad, decimales]
export const FIJAS: Record<string, Record<string, [string, string, number]>> = {
  reco: {
    ia: ['Ia', 'A', 0], ib: ['Ib', 'A', 0], ic: ['Ic', 'A', 0],
    va: ['Va', 'V', 0], vb: ['Vb', 'V', 0], vc: ['Vc', 'V', 0], operaciones: ['Operaciones', '', 0],
  },
  reg: { tap: ['Tap', '', 0], v: ['V', 'V', 0], i: ['I', 'A', 0], vConsigna: ['Consigna', 'V', 0] },
  medidor: { voltage: ['V', 'V', 0], current: ['I', 'A', 0], power: ['P', 'kW', 0], pf: ['FP', '', 2] },
  bomba: { current: ['I', 'A', 0], frequency: ['f', 'Hz', 1], power: ['P', 'kW', 0] },
}

type Linea = { clave: string; etiqueta: string; texto?: string; luces?: { on: boolean | null | undefined; label: string }[] }

// Dato con comunicación y fresco; si no, «—» (nunca un valor viejo)
export const fresco = (s: { online: boolean; license?: string; sinEnlace?: string; _ts?: number; pollMs?: number } | undefined, v: Vivos) =>
  !!s && s.online && s.license !== 'excedido' && !s.sinEnlace && !isStale(s._ts, v.ahora, s.pollMs)

export function lineas(n: Nodo, v: Vivos): Linea[] {
  const eq = equipoDe(n, v)
  if (!eq.existe) return []
  const banco = n.banco != null
  return (n.mostrar ?? []).map((m): Linea | null => {
    if (typeof m === 'string') {
      const f = FIJAS[n.tipo]?.[m]
      if (!f) return null
      const [etiqueta, unidad, dec] = f
      const vals = eq.campos.length ? eq.campos.map(({ st }) => fresco(st, v) ? st!.valores[m] : null)
        : [eq.meter && fresco(eq.meter, v) ? (m === 'power' ? (eq.meter.power == null ? null : eq.meter.power / 1000) : (eq.meter as any)[m])
          : eq.drive && fresco(eq.drive, v) ? (eq.drive as any)[m] : null]
      const txt = vals.map(x => {
        const s = fmt(typeof x === 'number' ? x : null, dec)
        return m === 'tap' && typeof x === 'number' && x > 0 ? `+${s}` : s
      })
      return { clave: m, etiqueta, texto: txt.every(t => t === '—') ? '—' : `${txt.join(' / ')}${unidad ? ' ' + unidad : ''}` }
    }
    if ('med' in m) {
      const partes = eq.campos.map(({ cfg, st }) => {
        const p = puntosLibres(cfg).meds.find(x => x.nombre === m.med)
        return { p, t: p && fresco(st, v) ? fmt(st?.extras?.[m.med], p.decimales ?? 0) : '—' }
      })
      const unidad = partes.find(x => x.p?.unidad)?.p?.unidad
      return { clave: 'm:' + m.med, etiqueta: m.med, texto: partes.every(x => x.t === '—') ? '—' : `${partes.map(x => x.t).join(' / ')}${unidad ? ' ' + unidad : ''}` }
    }
    return {
      clave: 's:' + m.senal, etiqueta: m.senal,
      luces: eq.campos.map(({ st }, i) => ({ on: fresco(st, v) ? st?.senales?.[m.senal] : null, label: banco ? `F${i + 1}` : m.senal })),
    }
  }).filter((x): x is Linea => !!x)
}

// Mediciones y señales junto al símbolo (spec §3.5)
export default function Mediciones({ nodo, vivos }: { nodo: Nodo; vivos: Vivos }) {
  const ls = lineas(nodo, vivos)
  if (!ls.length) return null
  return (
    <div className="rounded bg-card/90 border border-border/60 px-1.5 py-1 text-[11px] leading-tight tabular-nums whitespace-nowrap text-foreground">
      {ls.map(l => l.luces ? (
        <div key={l.clave} className="flex items-center gap-1.5">
          {nodo.banco != null && <span className="text-muted-foreground">{l.etiqueta}</span>}
          {l.luces.map((x, i) => <Luz key={i} on={x.on} label={x.label} />)}
        </div>
      ) : (
        <div key={l.clave}><span className="text-muted-foreground">{l.etiqueta}</span> <span className="font-semibold">{l.texto}</span></div>
      ))}
    </div>
  )
}
