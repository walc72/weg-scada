import type { ReactNode } from 'react'
import { useRef } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { useNavigate } from 'react-router-dom'
import { WifiOff, AlertTriangle } from 'lucide-react'
import { estadoEquipo } from '../../lib/energizar'
import type { Estado, Resultado, Vivos } from '../../lib/energizar'
import { recoCerrado } from '../../lib/reco'
import { puntosDe } from '../../lib/unifilar'
import type { Dibujo, Nodo } from '../../lib/unifilar'
import { AMBAR, GRIS, colorDe, useUnifilar } from './contexto'
import Mediciones, { equipoDe, fresco } from './Mediciones'

type NP = NodeProps<Node<{ nodo: Nodo }>>

const S = 48                      // lado del símbolo; los puntos a/b caen en el centro de los bordes
const ROJO = '#ef4444'
const EQUIPOS = ['reco', 'reg', 'medidor', 'bomba', 'caudalimetro', 'comm']

// Punto de conexión: posición en el símbolo sin rotar y hacia dónde sale el cable
interface Punto { id: string; x: number; y: number; dx: number; dy: number }

function puntos(n: Nodo): Punto[] {
  return puntosDe(n).map((id, i) => {
    if (n.tipo === 'barra') return { id, x: i * 20, y: 5, dx: 0, dy: 1 }
    const abajo = id === 'b' || n.tipo === 'fuente'
    return { id, x: S / 2, y: abajo ? S : 0, dx: 0, dy: abajo ? 1 : -1 }
  })
}

const medida = (n: Nodo) => (n.tipo === 'barra' ? { w: n.largo ?? 40, h: 10 } : { w: S, h: S })

// Gira un vector (x, y) respecto del centro según rot (sentido horario, como CSS)
const girar = (x: number, y: number, rot: number): [number, number] =>
  rot === 90 ? [-y, x] : rot === 180 ? [-x, -y] : rot === 270 ? [y, -x] : [x, y]

const lado = (dx: number, dy: number) =>
  Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? Position.Top : Position.Bottom) : (dx < 0 ? Position.Left : Position.Right)

// Resumen del bloque sitio (spec §3.6)
export function resumenSitio(d: Dibujo, res: Resultado, v: Vivos) {
  let alarmas = 0, sinCom = 0
  for (const n of d.nodos) {
    if (!EQUIPOS.includes(n.tipo)) continue
    const e = estadoEquipo(n, v)
    if (e.online === 'no') sinCom++; else alarmas += e.alarmas.length
  }
  return { energizado: [...res.tramos.values()].some(s => s === 'energizado'), alarmas, sinCom }
}

interface Trazo { a: string; b: string; cuerpo: string; da?: string; db?: string; relleno?: boolean }

// Dibujo IEC simple de cada tipo, 48x48, punto a arriba y b abajo (fuente: a abajo)
function Dibujito({ n, t, cerrado }: { n: Nodo; t: Trazo; cerrado: boolean }): ReactNode {
  const fondo = 'hsl(var(--card))'
  const texto = (s: string, y: number, tam = 14) => <text x={24} y={y} fontSize={tam} fontWeight={700} textAnchor="middle" fill="currentColor" stroke="none">{s}</text>
  const cab = (d: string, c: string, dash?: string) => <path d={d} stroke={c} strokeDasharray={dash} />
  switch (n.tipo) {
    case 'reco': return <>{cab('M24 0V14', t.a, t.da)}{cab('M24 34V48', t.b, t.db)}
      <rect x={16} y={14} width={16} height={20} rx={2} stroke={t.cuerpo} fill={cerrado ? t.cuerpo : fondo} /></>
    case 'reg': return <>{cab('M24 0V10', t.a, t.da)}{cab('M24 38V48', t.b, t.db)}
      <circle cx={24} cy={24} r={14} stroke={t.cuerpo} /><path d="M14 34L34 14" stroke={t.cuerpo} />
      <polygon points="34,14 27,15 33,21" fill={t.cuerpo} stroke="none" /></>
    case 'medidor': return <>{cab('M24 0V10', t.a, t.da)}{cab('M24 38V48', t.b, t.db)}
      <circle cx={24} cy={24} r={14} stroke={t.cuerpo} />{texto('W', 29)}</>
    case 'trafo': return <>{cab('M24 0V8', t.a, t.da)}{cab('M24 40V48', t.b, t.db)}
      <circle cx={24} cy={19} r={11} stroke={t.cuerpo} /><circle cx={24} cy={29} r={11} stroke={t.cuerpo} /></>
    case 'seccionador': return <>{cab('M24 0V12', t.a, t.da)}{cab('M24 36V48', t.b, t.db)}
      <path d={cerrado ? 'M24 12V36' : 'M24 36L34 14'} stroke={t.cuerpo} /><circle cx={24} cy={12} r={2.5} fill={t.cuerpo} /><circle cx={24} cy={36} r={2.5} fill={t.cuerpo} /></>
    case 'fusible': return <>{cab('M24 0V10', t.a, t.da)}{cab('M24 38V48', t.b, t.db)}
      <rect x={19} y={10} width={10} height={28} stroke={t.cuerpo} fill={fondo} /><path d="M24 10V38" stroke={t.cuerpo} /></>
    case 'bomba': return <>{cab('M24 0V15', t.a, t.da)}<circle cx={24} cy={30} r={15} stroke={t.cuerpo} />{texto('M', 36, 16)}</>
    case 'carga': return <>{cab('M24 0V16', t.a, t.da)}<polygon points="14,16 34,16 24,38" stroke={t.cuerpo} fill={t.relleno ? t.cuerpo : fondo} /></>
    case 'fuente': return <>{cab('M24 30V48', t.a, t.da)}<circle cx={24} cy={16} r={14} stroke={t.cuerpo} />
      <path d="M16 16q4 -7 8 0t8 0" stroke={t.cuerpo} /></>
    case 'barra': return <rect x={0} y={0} width={n.largo ?? 40} height={10} rx={2} fill={t.cuerpo} stroke="none" />
    case 'caudalimetro': return <><circle cx={24} cy={24} r={16} stroke={t.cuerpo} />{texto('Q', 30, 16)}</>
    case 'comm': return <><circle cx={24} cy={32} r={3} fill={t.cuerpo} /><path d="M16 24q8 -8 16 0M10 18q14 -14 28 0" stroke={t.cuerpo} /><path d="M24 35V46" stroke={t.cuerpo} /></>
    default: return null
  }
}

// Tirador de la barra: arrastrarlo la estira (grilla de 10 px); p0 queda fija
function Tirador({ n, x, y }: { n: Nodo; x: number; y: number }) {
  const { onBarra } = useUnifilar()
  const { getZoom } = useReactFlow()
  const ini = useRef<{ px: number; py: number; largo: number } | null>(null)
  const [ex, ey] = girar(1, 0, n.rot ?? 0) // hacia dónde crece la barra en pantalla
  return (
    <div className={`nodrag nopan absolute h-3.5 w-3.5 rounded-full border-2 border-primary bg-background ${ex ? 'cursor-ew-resize' : 'cursor-ns-resize'}`}
      style={{ left: x, top: y, transform: 'translate(-50%,-50%)', touchAction: 'none' }}
      onPointerDown={e => {
        e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId)
        ini.current = { px: e.clientX, py: e.clientY, largo: n.largo ?? 40 }
        onBarra?.(n.id, ini.current.largo, true)
      }}
      onPointerMove={e => {
        const i = ini.current
        if (i) onBarra?.(n.id, i.largo + ((e.clientX - i.px) * ex + (e.clientY - i.py) * ey) / getZoom(), false)
      }}
      onPointerUp={() => { ini.current = null }} />
  )
}

// Nodo de equipo/eléctrico: símbolo coloreado por estado + etiqueta + mediciones
function Simbolo({ data, selected }: NP) {
  const n = data.nodo
  const { vivos, res, colores, editando } = useUnifilar()
  const eq = equipoDe(n, vivos)
  const esEquipo = EQUIPOS.includes(n.tipo)
  const est = esEquipo ? estadoEquipo(n, vivos) : undefined
  const sinCom = est?.online === 'no'
  const alarma = !!est && !sinCom && est.alarmas.length > 0
  const col = (s?: Estado) => colorDe(s ?? 'desconocido', colores)
  const pa = col(res.puntos.get(`${n.id}:a`)), pb = col(res.puntos.get(`${n.id}:b`))
  // cuerpo: reco por cerrado/abierto/disparo, seccionador y fusible por lo marcado, el resto por la energización
  let cuerpo = col(res.nodos.get(n.id)).stroke, cerrado = false
  if (n.tipo === 'reco' && !sinCom) {
    const r = recoCerrado(vivos.campo.get(n.ref ?? '')!)
    cerrado = r === 'cerrado'
    cuerpo = r === 'cerrado' ? col('energizado').stroke : r === 'abierto' ? col('sinTension').stroke : r === 'disparo' ? ROJO : AMBAR
  } else if (n.tipo === 'seccionador' || n.tipo === 'fusible') {
    cerrado = !!n.cerrado
    cuerpo = col(cerrado ? 'energizado' : 'sinTension').stroke
  } else if (n.tipo === 'comm') cuerpo = '#22c55e'
  if (sinCom) cuerpo = GRIS
  else if (est?.online === 'parcial') cuerpo = AMBAR

  const { w, h } = medida(n)
  const rot = n.rot ?? 0
  const bw = rot % 180 ? h : w, bh = rot % 180 ? w : h
  const hs = puntos(n).map(p => {
    const [rx, ry] = girar(p.x - w / 2, p.y - h / 2, rot)
    const [dx, dy] = girar(p.dx, p.dy, rot)
    return { id: p.id, x: bw / 2 + rx, y: bh / 2 + ry, pos: lado(dx, dy) }
  })
  const vivas = eq.campos.filter(c => fresco(c.st, vivos)).length

  return (
    <div style={{ width: bw, height: bh }} className="relative">
      {alarma && <div className="absolute -inset-1.5 rounded-md border-2 border-red-500 animate-pulse pointer-events-none" />}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        className={`absolute text-foreground ${sinCom ? 'opacity-60' : ''}`}
        style={{ left: (bw - w) / 2, top: (bh - h) / 2, transform: `rotate(${rot}deg)` }}>
        <Dibujito n={n} cerrado={cerrado} t={{ a: pa.stroke, b: pb.stroke, da: pa.dash, db: pb.dash, cuerpo, relleno: n.tipo === 'carga' && res.nodos.get(n.id) === 'energizado' }} />
      </svg>
      {hs.map(p => (
        <Handle key={p.id} id={p.id} type="source" position={p.pos} isConnectable={!!editando}
          style={editando
            ? { left: p.x, top: p.y, transform: 'translate(-50%,-50%)', width: 8, height: 8, minWidth: 0, minHeight: 0, background: 'hsl(var(--primary))', border: '1px solid hsl(var(--background))' }
            : { left: p.x, top: p.y, transform: 'translate(-50%,-50%)', width: 2, height: 2, minWidth: 0, minHeight: 0, background: 'transparent', border: 'none' }} />
      ))}
      {editando && selected && n.tipo === 'barra' && (() => {
        // tirador en el extremo opuesto a p0
        const [rx, ry] = girar(w / 2, 0, rot)
        return <Tirador n={n} x={bw / 2 + rx} y={bh / 2 + ry} />
      })()}
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 flex flex-col items-center text-[11px] leading-tight whitespace-nowrap pointer-events-none">
        {(n.nombre || eq.nombre) && <span className="font-semibold text-foreground">{n.nombre || eq.nombre}</span>}
        {esEquipo && !eq.existe && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />equipo no encontrado</span>}
        {esEquipo && eq.existe && n.banco != null && est && <span className={est.online === 'parcial' ? 'text-amber-500' : 'text-muted-foreground'}>{vivas}/{eq.campos.length} en línea</span>}
        {esEquipo && eq.existe && sinCom && (
          <span className="text-muted-foreground flex items-center gap-1"><WifiOff className="h-3 w-3" />{est?.sinEnlace ? `Sin enlace · ${est.sinEnlace}` : 'Sin comunicación'}</span>
        )}
      </div>
      {esEquipo && eq.existe && <div className="absolute left-full ml-2 top-0 pointer-events-none"><Mediciones nodo={n} vivos={vivos} /></div>}
    </div>
  )
}

function Texto({ data }: NP) {
  const n = data.nodo
  return <div className="text-foreground whitespace-pre-wrap" style={{ fontSize: n.tam ?? 16 }}>{n.texto}</div>
}

function Recuadro({ data }: NP) {
  const n = data.nodo
  return (
    <div style={{ width: n.ancho, height: n.alto }} className="rounded-lg border-2 border-dashed border-border bg-muted/20">
      {n.titulo && <div className="px-2 py-0.5 text-xs font-semibold text-muted-foreground">{n.titulo}</div>}
    </div>
  )
}

// Bloque del general que resume un dibujo de sitio; clic = abrirlo
function Sitio({ data }: NP) {
  const n = data.nodo
  const { dibujos, resultados, vivos } = useUnifilar()
  const navigate = useNavigate()
  const d = dibujos.find(x => x.id === n.dibujo)
  const r = d && resultados.get(d.id)
  const s = d && r ? resumenSitio(d, r, vivos) : null
  return (
    <button type="button" onClick={() => d && navigate(`/unifilar/${d.id}`)}
      className={`w-48 rounded-lg border-2 bg-card p-3 text-left shadow-sm hover:bg-muted ${s && s.alarmas > 0 ? 'border-red-500 animate-pulse' : 'border-border'}`}>
      <div className="text-sm font-bold text-foreground">{d?.nombre ?? 'sitio no encontrado'}</div>
      {s && (
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.energizado ? '#22c55e' : GRIS }} />{s.energizado ? 'Energizado' : 'Sin tensión'}</div>
          <div className={s.alarmas ? 'text-red-500 font-semibold' : ''}>{s.alarmas ? `${s.alarmas} alarma${s.alarmas > 1 ? 's' : ''}` : 'Sin alarmas'}</div>
          {s.sinCom > 0 && <div className="flex items-center gap-1 text-amber-500"><WifiOff className="h-3 w-3" />{s.sinCom} sin comunicación</div>}
        </div>
      )}
    </button>
  )
}

export const nodeTypes = {
  reco: Simbolo, reg: Simbolo, medidor: Simbolo, bomba: Simbolo, caudalimetro: Simbolo,
  fuente: Simbolo, barra: Simbolo, trafo: Simbolo, seccionador: Simbolo, fusible: Simbolo, carga: Simbolo, comm: Simbolo,
  texto: Texto, recuadro: Recuadro, sitio: Sitio,
}
