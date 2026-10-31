import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Handle, NodeResizer, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { EQUIPOS, estadoEquipo, resumenSitio } from '../../lib/energizar'
import type { Estado, EstadoSitio } from '../../lib/energizar'
import { fmt } from '../CampoBase'
import { recoCerrado } from '../../lib/reco'
import { ZOOM_LETRA } from '../../lib/unifilar'
import type { Dibujo, Nodo } from '../../lib/unifilar'
import { S, bornes, tramoCorto } from '../../lib/bornes'
import { AMBAR, GRIS, colorDe, useUnifilar } from './contexto'
import Mediciones, { equipoDe, fresco } from './Mediciones'
import Orto from './Orto'

type NP = NodeProps<Node<{ nodo: Nodo }>>

const ROJO = '#ef4444'

const medida = (n: Nodo) => (n.tipo === 'barra' ? { w: n.largo ?? 40, h: 10 } : { w: S * (n.escala ?? 1), h: S * (n.escala ?? 1) })

// Manijas de tamaño en el editor: el símbolo mantiene la proporción, el recuadro no
function Manijas({ n, visible, proporcion }: { n: Nodo; visible: boolean; proporcion: boolean }) {
  const { onTam } = useUnifilar()
  if (!onTam) return null
  return <NodeResizer isVisible={visible} keepAspectRatio={proporcion} minWidth={proporcion ? S / 2 : 40} minHeight={proporcion ? S / 2 : 30}
    color="hsl(var(--primary))" handleStyle={{ width: 8, height: 8 }}
    onResizeStart={(_, p) => onTam(n.id, p, true)} onResize={(_, p) => onTam(n.id, p, false)} />
}

// Tamaño de letra del nodo: zoom sobre el texto (sin campo = normal, sin estilo)
const letra = (n: Nodo) => (n.letra ? { zoom: ZOOM_LETRA[n.letra] } : undefined)

// Gira un vector (x, y) respecto del centro según rot (sentido horario, como CSS)
const girar = (x: number, y: number, rot: number): [number, number] =>
  rot === 90 ? [-y, x] : rot === 180 ? [-x, -y] : rot === 270 ? [y, -x] : [x, y]

const lado = (dx: number, dy: number) =>
  Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? Position.Top : Position.Bottom) : (dx < 0 ? Position.Left : Position.Right)

const POSICION: Record<string, Position> = { arriba: Position.Top, abajo: Position.Bottom, izquierda: Position.Left, derecha: Position.Right }

// Reconectador dentro del bloque de sitio
const ESTADO_RECO: Record<string, { txt: string; clase: string }> = {
  cerrado: { txt: 'Cerrado', clase: 'text-green-600 dark:text-green-400' },
  abierto: { txt: 'Abierto', clase: 'text-muted-foreground' },
  disparo: { txt: 'Disparo', clase: 'text-red-500' },
  null: { txt: 'Estado desconocido', clase: 'text-amber-500' },
}
const ESTADO_BOMBA: Record<string, { txt: string; clase: string }> = {
  marcha: { txt: 'En marcha', clase: 'text-green-600 dark:text-green-400' },
  parada: { txt: 'Parada', clase: 'text-muted-foreground' },
  falla: { txt: 'Falla', clase: 'text-red-500' },
}
// caudal como en el resto del portal (sin decimales desde 100), con coma decimal como el resto del bloque
const caudal = (q?: number | null) => fmt(q, q != null && Math.abs(q) < 100 ? 1 : 0, 'm³/h')
const conSigno = (x: number | null) => (x == null ? '—' : x > 0 ? `+${fmt(x)}` : fmt(x))

// Estado del bloque de sitio: texto, color del punto y del borde (desconocido punteado)
const ESTADO_SITIO: Record<EstadoSitio, { txt: string; color: string; dash?: boolean }> = {
  energizado: { txt: 'Energizado', color: '#22c55e' },
  parcial: { txt: 'Parcial', color: AMBAR },
  desconocido: { txt: 'Desconocido', color: AMBAR, dash: true },
  sinTension: { txt: 'Sin tensión', color: GRIS },
}

// movidos: bornes cambiados de lado (su tramo propio no se dibuja; va un tramo corto al lado nuevo)
interface Trazo { a: string; b: string; cuerpo: string; da?: string; db?: string; relleno?: boolean; movidos: Set<string> }

// Dibujo IEC simple de cada tipo, 48x48, punto a arriba y b abajo (fuente: a abajo)
function Dibujito({ n, t, cerrado }: { n: Nodo; t: Trazo; cerrado: boolean }): ReactNode {
  const fondo = 'hsl(var(--card))'
  const texto = (s: string, y: number, tam = 14) => <text x={24} y={y} fontSize={tam} fontWeight={700} textAnchor="middle" fill="currentColor" stroke="none">{s}</text>
  const cab = (p: string, d: string, c: string, dash?: string) => (t.movidos.has(p) ? null : <path d={d} stroke={c} strokeDasharray={dash} />)
  // tramo de medición/datos propio del símbolo, solo si el borne está en su lado de siempre
  const aux = (p: string, d: string) => (t.movidos.has(p) ? null : <path d={d} stroke={t.cuerpo} strokeWidth={1.5} />)
  switch (n.tipo) {
    case 'reco': return <>{cab('a', 'M24 0V14', t.a, t.da)}{cab('b', 'M24 34V48', t.b, t.db)}
      <rect x={16} y={14} width={16} height={20} rx={2} stroke={t.cuerpo} fill={cerrado ? t.cuerpo : fondo} /></>
    case 'reg': return <>{cab('a', 'M24 0V10', t.a, t.da)}{cab('b', 'M24 38V48', t.b, t.db)}
      <circle cx={24} cy={24} r={14} stroke={t.cuerpo} /><path d="M14 34L34 14" stroke={t.cuerpo} />
      <polygon points="34,14 27,15 33,21" fill={t.cuerpo} stroke="none" /></>
    case 'medidor': return <>{cab('a', 'M24 0V10', t.a, t.da)}{cab('b', 'M24 38V48', t.b, t.db)}
      <circle cx={24} cy={24} r={14} stroke={t.cuerpo} />{texto('W', 29)}{aux('m', 'M38 24H48')}</>
    case 'tc': return <>{cab('a', 'M24 0V24', t.a, t.da)}{cab('b', 'M24 24V48', t.b, t.db)}
      <circle cx={24} cy={24} r={10} stroke={t.cuerpo} />{aux('s', 'M34 24H48')}</>
    case 'tp': return <>{cab('a', 'M24 0V10', t.a, t.da)}
      <circle cx={24} cy={18} r={8} stroke={t.cuerpo} /><circle cx={24} cy={28} r={8} stroke={t.cuerpo} />{aux('s', 'M32 28H40V24H48')}</>
    case 'trafo': return <>{cab('a', 'M24 0V8', t.a, t.da)}{cab('b', 'M24 40V48', t.b, t.db)}
      <circle cx={24} cy={19} r={11} stroke={t.cuerpo} /><circle cx={24} cy={29} r={11} stroke={t.cuerpo} /></>
    case 'seccionador': return <>{cab('a', 'M24 0V12', t.a, t.da)}{cab('b', 'M24 36V48', t.b, t.db)}
      <path d={cerrado ? 'M24 12V36' : 'M24 36L34 14'} stroke={t.cuerpo} /><circle cx={24} cy={12} r={2.5} fill={t.cuerpo} /><circle cx={24} cy={36} r={2.5} fill={t.cuerpo} /></>
    case 'fusible': return <>{cab('a', 'M24 0V10', t.a, t.da)}{cab('b', 'M24 38V48', t.b, t.db)}
      <rect x={19} y={10} width={10} height={28} stroke={t.cuerpo} fill={fondo} /><path d="M24 10V38" stroke={t.cuerpo} /></>
    case 'bomba': return <>{cab('a', 'M24 0V15', t.a, t.da)}<circle cx={24} cy={30} r={15} stroke={t.cuerpo} />{texto('M', 36, 16)}</>
    case 'carga': return <>{cab('a', 'M24 0V16', t.a, t.da)}<polygon points="14,16 34,16 24,38" stroke={t.cuerpo} fill={t.relleno ? t.cuerpo : fondo} /></>
    // puertos del sitio: la Entrada trae la tensión desde la red general (sale por abajo), la Salida la devuelve (entra por arriba)
    case 'entrada': return <>{cab('a', 'M24 32V48', t.a, t.da)}<path d="M10 6H38V20L24 32L10 20Z" stroke={t.cuerpo} fill={fondo} />{texto('E', 22, 12)}</>
    case 'salida': return <>{cab('a', 'M24 0V16', t.a, t.da)}<path d="M10 28L24 16L38 28V42H10Z" stroke={t.cuerpo} fill={fondo} />{texto('S', 38, 12)}</>
    case 'fuente': return <>{cab('a', 'M24 30V48', t.a, t.da)}<circle cx={24} cy={16} r={14} stroke={t.cuerpo} />
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

// Texto en posición libre: en el editor se arrastra (grilla de 10 px, relativo al centro del símbolo)
function TextoLibre({ n, x, y, children }: { n: Nodo; x: number; y: number; children: ReactNode }) {
  const { editando, onTexto } = useUnifilar()
  const { getZoom } = useReactFlow()
  const ini = useRef<{ px: number; py: number; dx: number; dy: number } | null>(null)
  const p = n.posTexto as { dx: number; dy: number }
  return (
    <div className={`absolute z-10 flex flex-col items-start gap-1 ${editando ? 'nodrag nopan cursor-move rounded outline-dashed outline-1 outline-primary/60' : 'pointer-events-none'}`}
      style={{ left: x, top: y, touchAction: 'none' }}
      onPointerDown={editando ? e => {
        e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId)
        ini.current = { px: e.clientX, py: e.clientY, dx: p.dx, dy: p.dy }
        onTexto?.(n.id, p, true)
      } : undefined}
      onPointerMove={editando ? e => {
        const i = ini.current, z = getZoom()
        if (i) onTexto?.(n.id, { dx: Math.round((i.dx + (e.clientX - i.px) / z) / 10) * 10, dy: Math.round((i.dy + (e.clientY - i.py) / z) / 10) * 10 }, false)
      } : undefined}
      onPointerUp={() => { ini.current = null }}>
      {children}
    </div>
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
  const bs = bornes(n)
  // React Flow mide los bornes solo si cambia el tamaño del nodo; el símbolo es cuadrado, así que al
  // cambiar un lado o el giro hay que pedirle que los vuelva a medir (si no, la línea sale del lugar viejo)
  const remedir = useUpdateNodeInternals()
  const firma = `${rot}|${bs.map(b => b.lado).join(',')}`
  useEffect(() => { remedir(n.id) }, [firma, n.id, remedir])
  const hs = bs.map(p => {
    const [rx, ry] = girar(p.x - w / 2, p.y - h / 2, rot)
    const [dx, dy] = girar(p.dx, p.dy, rot)
    return { id: p.id, x: bw / 2 + rx, y: bh / 2 + ry, pos: lado(dx, dy) }
  })
  const movidos = bs.filter(b => b.movido)
  const vivas = eq.campos.filter(c => fresco(c.st, vivos)).length

  const nombre = (alinear: string) => (
    <div className={`flex flex-col ${alinear} text-[11px] leading-tight whitespace-nowrap rounded bg-card/85 px-1`} style={letra(n)}>
      {(n.nombre || eq.nombre) && <span className="font-semibold text-foreground">{n.nombre || eq.nombre}</span>}
      {n.relacion && <span className="text-muted-foreground">{n.relacion}</span>}
      {esEquipo && !eq.existe && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />equipo no encontrado</span>}
      {esEquipo && eq.existe && n.banco != null && est && <span className={est.online === 'parcial' ? 'text-amber-500' : 'text-muted-foreground'}>{vivas}/{eq.campos.length} en línea</span>}
      {esEquipo && eq.existe && sinCom && (
        <span className="text-muted-foreground flex items-center gap-1"><WifiOff className="h-3 w-3" />{est?.sinEnlace ? `Sin enlace · ${est.sinEnlace}` : 'Sin comunicación'}</span>
      )}
    </div>
  )
  const medis = esEquipo && eq.existe ? <div style={letra(n)}><Mediciones nodo={n} vivos={vivos} /></div> : null
  const pt = n.posTexto ?? 'abajo'

  return (
    <div style={{ width: bw, height: bh }} className="relative">
      {alarma && <div className="absolute -inset-1.5 rounded-md border-2 border-red-500 animate-pulse pointer-events-none" />}
      {/* dibujo en 48 px escalado; los trazos no engordan con la escala */}
      <svg width={w} height={h} viewBox={n.tipo === 'barra' ? `0 0 ${w} ${h}` : `0 0 ${S} ${S}`} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        className={`absolute text-foreground [&_*]:[vector-effect:non-scaling-stroke] ${sinCom ? 'opacity-60' : ''}`}
        style={{ left: (bw - w) / 2, top: (bh - h) / 2, transform: `rotate(${rot}deg)` }}>
        <Dibujito n={n} cerrado={cerrado} t={{ a: pa.stroke, b: pb.stroke, da: pa.dash, db: pb.dash, cuerpo, relleno: n.tipo === 'carga' && res.nodos.get(n.id) === 'energizado', movidos: new Set(movidos.map(b => b.id)) }} />
        {movidos.map(b => (
          <path key={b.id} d={tramoCorto(b.lado)} strokeWidth={b.id === 'a' || b.id === 'b' ? 2.5 : 1.5}
            stroke={b.id === 'a' ? pa.stroke : b.id === 'b' ? pb.stroke : cuerpo} strokeDasharray={b.id === 'a' ? pa.dash : b.id === 'b' ? pb.dash : undefined} />
        ))}
      </svg>
      {hs.map(p => (
        <Handle key={p.id} id={p.id} type="source" position={p.pos} isConnectable={!!editando}
          style={editando
            ? { left: p.x, top: p.y, transform: 'translate(-50%,-50%)', width: 8, height: 8, minWidth: 0, minHeight: 0, background: 'hsl(var(--primary))', border: '1px solid hsl(var(--background))' }
            : { left: p.x, top: p.y, transform: 'translate(-50%,-50%)', width: 2, height: 2, minWidth: 0, minHeight: 0, background: 'transparent', border: 'none' }} />
      ))}
      {editando && n.tipo !== 'barra' && <Manijas n={n} visible={!!selected} proporcion />}
      {editando && selected && n.tipo === 'barra' && (() => {
        // tirador en el extremo opuesto a p0
        const [rx, ry] = girar(w / 2, 0, rot)
        return <Tirador n={n} x={bw / 2 + rx} y={bh / 2 + ry} />
      })()}
      {/* texto: abajo (nombre abajo, mediciones a la derecha), arriba, a un costado o libre */}
      {(pt === 'abajo' || pt === 'arriba') && <>
        <div className={`absolute z-10 left-1/2 -translate-x-1/2 pointer-events-none ${pt === 'abajo' ? 'top-full mt-1' : 'bottom-full mb-1'}`}>{nombre('items-center')}</div>
        {medis && <div className="absolute left-full ml-2 top-0 pointer-events-none">{medis}</div>}
      </>}
      {(pt === 'izquierda' || pt === 'derecha') && (
        <div className={`absolute z-10 top-0 flex flex-col gap-1 pointer-events-none ${pt === 'izquierda' ? 'right-full mr-2 items-end' : 'left-full ml-2 items-start'}`}>
          {nombre(pt === 'izquierda' ? 'items-end' : 'items-start')}{medis}
        </div>
      )}
      {typeof pt === 'object' && <TextoLibre n={n} x={bw / 2 + pt.dx} y={bh / 2 + pt.dy}>{nombre('items-start')}{medis}</TextoLibre>}
    </div>
  )
}

function Texto({ data }: NP) {
  const n = data.nodo
  return <div className="text-foreground whitespace-pre-wrap" style={{ fontSize: n.tam ?? 16 }}>{n.texto}</div>
}

function Recuadro({ data, selected }: NP) {
  const n = data.nodo
  const { editando } = useUnifilar()
  return (
    <div style={{ width: n.ancho, height: n.alto }} className="rounded-lg border-2 border-dashed border-border bg-muted/20">
      {editando && <Manijas n={n} visible={!!selected} proporcion={false} />}
      {n.titulo && <div className="px-2 py-0.5 text-xs font-semibold text-muted-foreground" style={letra(n)}>{n.titulo}</div>}
    </div>
  )
}

// Bloque del general que resume un dibujo de sitio; clic = abrirlo
function Sitio({ data }: NP) {
  const n = data.nodo
  const { dibujos, resultados, vivos, editando } = useUnifilar()
  const navigate = useNavigate()
  const { search } = useLocation()  // conserva ?sala=1
  const d = dibujos.find(x => x.id === n.dibujo)
  const r = d && resultados.get(d.id)
  const s = d && r ? resumenSitio(d, r, vivos) : null
  const e = s?.estado ? ESTADO_SITIO[s.estado] : null
  const borne = editando
    ? { width: 8, height: 8, minWidth: 0, minHeight: 0, background: 'hsl(var(--primary))', border: '1px solid hsl(var(--background))' }
    : { width: 2, height: 2, minWidth: 0, minHeight: 0, background: 'transparent', border: 'none' }
  // entrada (a) y salida (b): por defecto arriba y abajo, con lado elegible; al cambiarlo se vuelven a medir
  const bs = bornes(n)
  const remedir = useUpdateNodeInternals()
  const firma = bs.map(b => b.lado).join(',')
  useEffect(() => { remedir(n.id) }, [firma, n.id, remedir])
  return (<>
    {bs.map(b => <Handle key={b.id} id={b.id} type="source" position={POSICION[b.lado]} isConnectable={!!editando} style={borne} />)}
    {/* ancho fijo: todos los bloques de sitio iguales; lo que no entra se parte en renglones */}
    <button type="button" onClick={() => d && navigate(`/unifilar/${d.id}${search}`)}
      className={`w-72 rounded-lg border-2 bg-card p-3 text-left shadow-sm hover:bg-muted [&_*]:!whitespace-normal ${s && s.alarmas > 0 ? 'border-red-500 animate-pulse' : ''}`}
      style={s && s.alarmas === 0 && e ? { borderColor: e.color, borderStyle: e.dash ? 'dashed' : 'solid' } : undefined}>
      {/* con letra más grande el bloque conserva el ancho y crece en alto */}
      <div className="text-sm font-bold text-foreground" style={letra(n)}>{d?.nombre ?? 'sitio no encontrado'}</div>
      {s && (
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground" style={letra(n)}>
          {e && <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: e.color }} />{e.txt}</div>}
          <div className={s.alarmas ? 'text-red-500 font-semibold' : ''}>{s.alarmas ? `${s.alarmas} alarma${s.alarmas > 1 ? 's' : ''}` : 'Sin alarmas'}</div>
          {s.sinCom > 0 && <div className="flex items-center gap-1 text-amber-500"><WifiOff className="h-3 w-3" />{s.sinCom} sin comunicación</div>}
          {s.recos.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t pt-1.5">
              {s.recos.map(r => (
                <div key={r.nombre} className="whitespace-nowrap">
                  <span className="font-semibold text-foreground">{r.nombre}</span>{' '}
                  {r.online
                    ? <><span className={`font-semibold ${ESTADO_RECO[r.estado ?? 'null'].clase}`}>{ESTADO_RECO[r.estado ?? 'null'].txt}</span>{r.ia != null && <span className="tabular-nums"> · Ia {fmt(r.ia, 0, 'A')}</span>}</>
                    : <span className="inline-flex items-center gap-1"><WifiOff className="h-3 w-3" />Sin comunicación</span>}
                </div>
              ))}
              {s.masRecos > 0 && <div>+{s.masRecos} reconectador{s.masRecos > 1 ? 'es' : ''} más</div>}
            </div>
          )}
          {s.regs.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t pt-1.5">
              {s.regs.map(g => (
                <div key={g.nombre} className="whitespace-nowrap">
                  <span className="font-semibold text-foreground">{g.nombre}</span>{' '}
                  {g.vivas === 0
                    ? <span className="inline-flex items-center gap-1"><WifiOff className="h-3 w-3" />Sin comunicación</span>
                    : <span className="tabular-nums">Tap {g.taps.map(conSigno).join(' / ')} · V {g.vs.map(x => fmt(x, 0)).join(' / ')} V
                        {g.total > 1 && g.vivas < g.total && <span className="text-amber-500"> · {g.vivas}/{g.total} en línea</span>}</span>}
                </div>
              ))}
              {s.masRegs > 0 && <div>+{s.masRegs} regulador{s.masRegs > 1 ? 'es' : ''} más</div>}
            </div>
          )}
          {s.medidores.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t pt-1.5">
              {s.medidores.map(m => (
                <div key={m.nombre} className="whitespace-nowrap">
                  <span className="font-semibold text-foreground">{m.nombre}</span>{' '}
                  {m.online
                    ? <span className="tabular-nums">P {fmt(m.kw, 0, 'kW')} · V {fmt(m.v, 0, 'V')} · I {fmt(m.i, 0, 'A')}</span>
                    : <span className="inline-flex items-center gap-1"><WifiOff className="h-3 w-3" />Sin comunicación</span>}
                </div>
              ))}
              {s.masMedidores > 0 && <div>+{s.masMedidores} medidor{s.masMedidores > 1 ? 'es' : ''} más</div>}
            </div>
          )}
          {(s.bombas.length > 0 || s.caudalimetros.length > 0) && (
            <div className="mt-1.5 space-y-0.5 border-t pt-1.5">
              {s.caudalTotal != null && <div className="tabular-nums"><span className="font-semibold text-foreground">Caudal total</span> {caudal(s.caudalTotal)}</div>}
              {s.bombas.map(b => (
                <div key={b.nombre} className="whitespace-nowrap">
                  <span className="font-semibold text-foreground">{b.nombre}</span>{' '}
                  {b.online
                    ? <><span className={`font-semibold ${ESTADO_BOMBA[b.estado!].clase}`}>{ESTADO_BOMBA[b.estado!].txt}</span>
                        <span className="tabular-nums"> · {fmt(b.i, 0, 'A')} · {fmt(b.hz, 1, 'Hz')} · {fmt(b.kw, 0, 'kW')}{b.q != null && ` · ${caudal(b.q)}`}</span></>
                    : <span className="inline-flex items-center gap-1"><WifiOff className="h-3 w-3" />Sin comunicación</span>}
                </div>
              ))}
              {s.masBombas > 0 && <div>+{s.masBombas} bomba{s.masBombas > 1 ? 's' : ''} más</div>}
              {s.caudalimetros.map(q => (
                <div key={q.nombre} className="whitespace-nowrap">
                  <span className="font-semibold text-foreground">{q.nombre}</span>{' '}
                  {q.online
                    ? <span className="tabular-nums">{caudal(q.q)}{q.total != null && ` · Σ ${fmt(q.total, 0, 'm³')}`}</span>
                    : <span className="inline-flex items-center gap-1"><WifiOff className="h-3 w-3" />Sin comunicación</span>}
                </div>
              ))}
            </div>
          )}
          {s.comms.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t pt-1.5">
              {s.comms.map(c => (
                <div key={c.nombre} className="flex items-center gap-1 whitespace-nowrap">
                  {c.online ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-red-500" />}
                  <span className="font-semibold text-foreground">{c.nombre}</span>
                  <span className={c.online ? '' : 'text-red-500'}>{c.online ? `En línea${c.signal != null ? ` · ${c.signal} dBm` : ''}` : 'Caído'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </button>
  </>)
}

// Conexiones ortogonales por geometría (ver Orto.tsx)
export const edgeTypes = { orto: Orto }

export const nodeTypes = {
  reco: Simbolo, reg: Simbolo, medidor: Simbolo, bomba: Simbolo, caudalimetro: Simbolo,
  fuente: Simbolo, barra: Simbolo, trafo: Simbolo, tc: Simbolo, tp: Simbolo, seccionador: Simbolo, fusible: Simbolo, carga: Simbolo, comm: Simbolo, entrada: Simbolo, salida: Simbolo,
  texto: Texto, recuadro: Recuadro, sitio: Sitio,
}
