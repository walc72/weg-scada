import '@xyflow/react/dist/style.css'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ReactFlow, Background, Controls, ConnectionMode } from '@xyflow/react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import { ChevronRight, Loader2, Monitor, Pencil } from 'lucide-react'
import { debeEncuadrar } from '../lib/sala'
import FranjaSala from '../components/unifilar/FranjaSala'
import { useTheme } from '../lib/theme'
import { useNow } from '../lib/useNow'
import { aFlow } from '../lib/unifilar'
import { energizarTodos, kwSale, listaAlarmas } from '../lib/energizar'
import type { ItemAlarma, Vivos } from '../lib/energizar'
import { useDrivesStore } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useUnifilarStore } from '../store/unifilar'
import { useAuthStore } from '../store/auth'
import { useServerStore } from '../store/server'
import { UnifilarCtx, colorDe } from '../components/unifilar/contexto'
import { nodeTypes, edgeTypes } from '../components/unifilar/Simbolos'
import PanelEquipo from '../components/unifilar/PanelEquipo'
import BarraAlarmas from '../components/unifilar/BarraAlarmas'
import { fmt } from '../components/CampoBase'
import type { Dibujo } from '../lib/unifilar'

const Editor = lazy(() => import('../components/unifilar/Editor'))

const CLICABLES = ['reco', 'reg', 'medidor', 'bomba', 'caudalimetro']

const kwTexto = (d: Dibujo, e: { source: string; target: string }, sentido: 1 | -1, v: Vivos) => {
  const kw = kwSale(d, e, sentido, v)
  return kw == null ? undefined : fmt(kw, 0, 'kW')
}

export default function Unifilar() {
  const { id = 'general' } = useParams()
  const { theme } = useTheme()
  const { data, error, aviso, cargar } = useUnifilarStore()
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const flowmeters = useDrivesStore(s => s.flowmeters)
  const comms = useDrivesStore(s => s.comms)
  const campo = useDrivesStore(s => s.campo)
  const config = useConfigStore(s => s.config)
  const ahora = useNow()
  const [sel, setSel] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [rf, setRf] = useState<ReactFlowInstance | null>(null)
  const navigate = useNavigate()
  // editar: solo admin, solo en planta (no réplica) y no en celular
  const admin = useAuthStore(s => s.isAdmin())
  const replica = useServerStore(s => s.replica)
  const [ancho, setAncho] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const f = () => setAncho(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  // Modo sala de control (?sala=1): pantalla entera, re-encuadre solo, cursor que se oculta; no se edita
  const [params] = useSearchParams()
  const sala = params.get('sala') === '1'
  const puedeEditar = admin && !replica && ancho && !sala
  const ultimaInteraccion = useRef(0), ultimoEncuadre = useRef(Date.now())
  const [cursorOculto, setCursorOculto] = useState(false)
  useEffect(() => {
    if (!sala || !rf) return
    const encuadrar = () => { rf.fitView({ padding: 0.2, duration: 400 }); ultimoEncuadre.current = Date.now() }
    const tarde = () => setTimeout(encuadrar, 150)
    const id = setInterval(() => { if (debeEncuadrar(Date.now(), ultimaInteraccion.current, ultimoEncuadre.current)) encuadrar() }, 30000)
    window.addEventListener('resize', tarde)
    document.addEventListener('fullscreenchange', tarde)
    return () => { clearInterval(id); window.removeEventListener('resize', tarde); document.removeEventListener('fullscreenchange', tarde) }
  }, [sala, rf])
  useEffect(() => {
    if (!sala) return
    let t: ReturnType<typeof setTimeout>
    const mover = () => { setCursorOculto(false); clearTimeout(t); t = setTimeout(() => setCursorOculto(true), 5000) }
    mover()
    window.addEventListener('mousemove', mover)
    return () => { clearTimeout(t); window.removeEventListener('mousemove', mover) }
  }, [sala])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => setSel(null), [id])

  const vivos = useMemo<Vivos | null>(
    () => config ? { campo, meters, drives, flowmeters, comms, config, ahora } : null,
    [campo, meters, drives, flowmeters, comms, config, ahora])

  // Energización de todos los dibujos: el general primero (los sitios pueden tomar estado de él)
  const resultados = useMemo(() => data && vivos ? energizarTodos(data, vivos) : new Map(), [data, vivos])

  const dibujo = data?.dibujos.find(d => d.id === id)
  const res = dibujo && resultados.get(dibujo.id)
  const colores = data?.colores ?? 'portal'

  const flow = useMemo(() => dibujo ? aFlow(dibujo) : null, [dibujo])
  const nodes = useMemo(() => (flow?.nodes ?? []).map(n => ({
    ...n, draggable: false, selectable: CLICABLES.includes(n.type), ...(n.type === 'recuadro' ? { zIndex: -1 } : {}),
  })) as Node[], [flow])
  const edges = useMemo(() => (flow?.edges ?? []).map(e => {
    const c = colorDe(res?.tramos.get(e.id) ?? 'desconocido', colores)
    const sentido = res?.sentido.get(e.id)
    return { ...e, type: 'orto', selectable: false, data: { sentido, kw: sentido && vivos && dibujo ? kwTexto(dibujo, e, sentido, vivos) : undefined },
      style: { stroke: c.stroke, strokeWidth: 3, strokeDasharray: c.dash } }
  }) as Edge[], [flow, res, colores, vivos, dibujo])
  const alarmas = useMemo(() => dibujo && vivos && data ? listaAlarmas(dibujo, data.dibujos, vivos) : [], [dibujo, vivos, data])

  // Ubica el equipo en el lienzo y abre su panel; un sitio abre su dibujo
  const irA = (i: ItemAlarma) => {
    if (i.dibujo) return navigate(`/unifilar/${i.dibujo}${sala ? '?sala=1' : ''}`)
    rf?.fitView({ nodes: [{ id: i.id }], padding: 2, maxZoom: 1.5, duration: 400 })
    const n = dibujo?.nodos.find(x => x.id === i.id)
    if (n && CLICABLES.includes(n.tipo)) setSel(n.id)
  }

  // ?equipo=<nodo> (enlace desde otra pantalla): el encuadre inicial va a ese equipo y se abre su panel
  const equipoParam = params.get('equipo')
  const enfoque = equipoParam && dibujo?.nodos.some(n => n.id === equipoParam) ? equipoParam : null
  const aplicado = useRef('')
  useEffect(() => {
    const clave = `${id}:${enfoque}`
    if (!enfoque || aplicado.current === clave) return
    aplicado.current = clave
    const n = dibujo?.nodos.find(x => x.id === enfoque)
    if (n && CLICABLES.includes(n.tipo)) setSel(n.id)
  }, [enfoque, id, dibujo])

  if (error) return <div className="text-center text-destructive text-sm py-16">No se pudo cargar el unifilar: {error}</div>
  if (!data || !vivos) return <div className="flex items-center justify-center py-16 text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Cargando...</div>
  if (!dibujo || !res) return <div className="text-center text-muted-foreground text-sm py-16">No existe el dibujo «{id}». <Link to="/unifilar" className="text-primary underline">Ir a la red general</Link></div>

  const general = data.dibujos.find(d => d.tipo === 'general')
  const nodoSel = dibujo.nodos.find(n => n.id === sel)

  return (
    <div className={sala ? `fixed inset-0 z-40 flex flex-col gap-2 bg-background p-3${cursorOculto ? ' cursor-none' : ''}` : 'flex flex-col gap-3 h-full min-h-[480px]'}>
      {sala && <FranjaSala dibujo={dibujo} general={general} onSalir={() => navigate(`/unifilar/${dibujo.id}`)} />}
      {aviso &&<div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{aviso}</div>}
      {editando && puedeEditar ? (
        <Suspense fallback={<div className="flex items-center justify-center py-16 text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Cargando editor...</div>}>
          <Editor vivos={vivos} dibujoInicial={id} onSalir={() => setEditando(false)} />
        </Suspense>
      ) : <>
      {!sala && <div className="flex items-center gap-1.5 text-sm">
        {dibujo.tipo === 'general' ? <span className="font-semibold">{dibujo.nombre}</span> : <>
          <Link to="/unifilar" className="text-primary hover:underline">{general?.nombre ?? 'Red general'}</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{dibujo.nombre}</span>
        </>}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => navigate(`/unifilar/${dibujo.id}?sala=1`)} title="Pantalla para dejar fija en un monitor"
            className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:bg-muted"><Monitor className="h-3.5 w-3.5" />Sala de control</button>
          {puedeEditar && (
            <button type="button" onClick={() => setEditando(true)}
              className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:bg-muted"><Pencil className="h-3.5 w-3.5" />Editar</button>
          )}
        </div>
      </div>}
      <BarraAlarmas items={alarmas} onIr={irA} />
      <div className="flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
        {dibujo.nodos.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm py-16">Este dibujo todavía no tiene elementos.</div>
        ) : (
          <UnifilarCtx.Provider value={{ vivos, res, colores, dibujos: data.dibujos, resultados }}>
            <ReactFlow key={dibujo.id} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} colorMode={theme}
              nodesDraggable={false} nodesConnectable={false} elementsSelectable connectionMode={ConnectionMode.Loose}
              minZoom={0.1} maxZoom={3} fitView
              fitViewOptions={enfoque ? { nodes: [{ id: enfoque }], padding: 2, maxZoom: 1.5 } : { padding: 0.2 }}
              onNodeClick={(_, n) => { if (CLICABLES.includes(n.type ?? '')) setSel(n.id) }}
              onPaneClick={() => setSel(null)} onInit={setRf}
              onMoveStart={ev => { if (ev) ultimaInteraccion.current = Date.now() }}>
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </UnifilarCtx.Provider>
        )}
      </div>
      {nodoSel && <PanelEquipo nodo={nodoSel} vivos={vivos} onClose={() => setSel(null)} />}
      </>}
    </div>
  )
}
