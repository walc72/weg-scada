import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, ConnectionMode, applyEdgeChanges, applyNodeChanges, useReactFlow } from '@xyflow/react'
import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react'
import { ArrowDown, ArrowUp, Copy, Loader2, Redo2, RotateCw, Save, Trash2, Undo2, Undo, X, ClipboardPaste, Plus, Pencil, Wand2, History } from 'lucide-react'
import PanelHistorial from './Historial'
import { useTheme } from '../../lib/theme'
import { ApiError } from '../../lib/api'
import { conexionValida, deFlow } from '../../lib/unifilar'
import type { Conexion, Dibujo, Nodo, Rot, Unifilar } from '../../lib/unifilar'
import { energizarTodos } from '../../lib/energizar'
import type { Vivos } from '../../lib/energizar'
import {
  borrar, deshacer, estirarBarra, fusionar, generarDesdeConfig, historialVacio, limpiar, nuevoId, nuevoNodo, pegar, registrar, rehacer,
} from '../../lib/unifilarEditor'
import type { Historial } from '../../lib/unifilarEditor'
import { toast } from 'sonner'
import { useUnifilarStore } from '../../store/unifilar'
import { ESTILO_DATOS, ESTILO_MEDICION, UnifilarCtx, colorDe, esPuntoMedicion } from './contexto'
import { nodeTypes, edgeTypes } from './Simbolos'
import Paleta from './Paleta'
import Propiedades from './Propiedades'

interface Estado { base: Unifilar; dibId: string; nodes: Node[]; edges: Edge[] }
const COALESCE_MS = 1000 // ediciones seguidas del mismo campo = un solo paso de deshacer

// Avisa al cerrar la pestaña o al tocar un enlace interno con cambios sin guardar.
// ponytail: BrowserRouter no tiene useBlocker; el botón «atrás» del navegador no se frena.
function useAvisoSalida(activo: boolean) {
  useEffect(() => {
    if (!activo) return
    const antes = (e: BeforeUnloadEvent) => { e.preventDefault() }
    const clic = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]')
      if (a && !a.getAttribute('href')?.startsWith('#') && !window.confirm('Hay cambios sin guardar en el unifilar. ¿Salir y perderlos?')) {
        e.preventDefault(); e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', antes)
    document.addEventListener('click', clic, true)
    return () => { window.removeEventListener('beforeunload', antes); document.removeEventListener('click', clic, true) }
  }, [activo])
}

const enCampo = (e: Event) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? '')
const bt = 'inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-40 disabled:hover:bg-background'

function EditorInterno({ vivos, dibujoInicial, onSalir }: { vivos: Vivos; dibujoInicial?: string; onSalir: () => void }) {
  const { theme } = useTheme()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const store = useUnifilarStore()
  const cfg = vivos.config

  const [estado, setEstado] = useState<Estado>(() => {
    const base = structuredClone(store.data!)
    const d = base.dibujos.find(x => x.id === dibujoInicial) ?? base.dibujos.find(x => x.tipo === 'general') ?? base.dibujos[0]
    return { base, dibId: d.id, ...fusionar([], [], d) }
  })
  const ref = useRef(estado) // último estado, para handlers que no deben leerlo viejo
  const poner = useCallback((e: Estado) => { ref.current = e; setEstado(e) }, [])
  const [hist, setHist] = useState<Historial<Unifilar>>(historialVacio)
  const histRef = useRef(hist)
  const ponerHist = (h: Historial<Unifilar>) => { histRef.current = h; setHist(h) }
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [conflicto, setConflicto] = useState(false)
  const [verHist, setVerHist] = useState(false)
  const ultimo = useRef<{ clave: string; t: number } | null>(null)
  const pendiente = useRef<Unifilar | null>(null) // estado previo a un gesto (arrastre, tirador); se registra solo si hubo cambio
  const portapapeles = useRef<{ nodos: Nodo[]; conexiones: Conexion[] } | null>(null)
  const lienzo = useRef<HTMLDivElement>(null)
  useAvisoSalida(sucio)

  // Archivo completo tal como está dibujado (el dibujo abierto sale del lienzo)
  const armar = (e = ref.current): Unifilar => ({
    ...e.base,
    dibujos: e.base.dibujos.map(d => d.id === e.dibId ? deFlow(d, e.nodes as any, e.edges as any) : d),
  })
  const data = useMemo(() => armar(estado), [estado]) // eslint-disable-line react-hooks/exhaustive-deps
  const dibujo = data.dibujos.find(d => d.id === estado.dibId)!
  const general = data.dibujos.find(d => d.tipo === 'general')
  const sitios = data.dibujos.filter(d => d.tipo === 'sitio')
  const resultados = useMemo(() => energizarTodos(data, vivos), [data, vivos])
  const res = resultados.get(dibujo.id)!
  const colores = data.colores ?? 'portal'

  // Aplica un archivo ya armado: el lienzo conserva selección y medidas
  const aplicar = (u: Unifilar, dibId: string, sel?: Set<string>) => {
    const e = ref.current
    const d = u.dibujos.find(x => x.id === dibId) ?? u.dibujos.find(x => x.tipo === 'general')!
    const mismo = d.id === e.dibId
    poner({ base: u, dibId: d.id, ...fusionar(mismo ? e.nodes : [], mismo ? e.edges : [], d, sel) })
  }

  // Toda edición pasa por acá: deja un paso de deshacer (clave: ediciones seguidas del mismo campo se juntan; null: sin paso)
  const mutar = (f: (u: Unifilar) => Unifilar, clave?: string | null, sel?: string[]) => {
    const antes = armar()
    const u = limpiar(f(antes))
    if (u === antes) return
    const t = Date.now()
    if (clave === null && pendiente.current) { ponerHist(registrar(histRef.current, pendiente.current)); pendiente.current = null }
    const junta = clave && ultimo.current?.clave === clave && t - ultimo.current.t < COALESCE_MS
    if (clave !== null && !junta) ponerHist(registrar(histRef.current, antes))
    ultimo.current = clave ? { clave, t } : null
    setSucio(true)
    aplicar(u, ref.current.dibId, sel ? new Set(sel) : undefined)
  }
  const cambiar = (f: (d: Dibujo) => Dibujo, clave?: string | null, sel?: string[]) =>
    mutar(u => {
      let hubo = false
      const dibujos = u.dibujos.map(d => { if (d.id !== ref.current.dibId) return d; const n = f(d); hubo ||= n !== d; return n })
      return hubo ? { ...u, dibujos } : u
    }, clave, sel)
  const editarNodo = (id: string, f: (n: Nodo) => Nodo, clave: string) =>
    cambiar(d => ({ ...d, nodos: d.nodos.map(n => n.id === id ? f(n) : n) }), clave)

  const irA = (id: string) => {
    const u = armar(), d = u.dibujos.find(x => x.id === id)!
    poner({ base: u, dibId: id, ...fusionar([], [], d) })
  }

  // --- selección y acciones ---
  const selN = estado.nodes.filter(n => n.selected), selE = estado.edges.filter(e => e.selected)
  const nodoSel = selN.length === 1 ? dibujo.nodos.find(n => n.id === selN[0].id) : undefined

  const agregar = (tipo: string, pos?: { x: number; y: number }) => {
    const r = lienzo.current?.getBoundingClientRect()
    const p = pos ?? (r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 })
    cambiar(d => {
      const id = nuevoId('n', d.nodos)
      return { ...d, nodos: [...d.nodos, nuevoNodo(tipo, p.x, p.y, id, cfg, sitios[0]?.id)] }
    }, undefined, [nuevoId('n', dibujo.nodos)])
  }
  // Propuesta inicial desde Configuración: solo en un dibujo vacío, se deshace y se guarda como cualquier edición
  const generar = () => {
    const nodos = generarDesdeConfig(cfg)
    if (dibujo.nodos.length || !nodos.length) return
    cambiar(d => ({ ...d, nodos }))
    setTimeout(() => fitView({ padding: 0.2 }), 50)
  }
  const eliminar = () => {
    if (!selN.length && !selE.length) return
    cambiar(d => borrar(d, new Set(selN.map(n => n.id)), new Set(selE.map(e => e.id))))
  }
  const copiar = () => {
    if (!selN.length) return
    const ids = new Set(selN.map(n => n.id))
    portapapeles.current = {
      nodos: dibujo.nodos.filter(n => ids.has(n.id)),
      conexiones: dibujo.conexiones.filter(c => ids.has(c.desde[0]) && ids.has(c.hasta[0])),
    }
  }
  const pegarLo = () => {
    const copiado = portapapeles.current
    if (!copiado) return
    // un bloque de sitio no puede ir dentro de un dibujo de sitio (igual que en la paleta)
    const sinSitio = dibujo.tipo === 'sitio' ? copiado.nodos.filter(n => n.tipo !== 'sitio') : copiado.nodos
    if (sinSitio.length < copiado.nodos.length) toast.warning('Los bloques de sitio no se pegan dentro de un dibujo de sitio')
    if (!sinSitio.length) return
    const p = { ...copiado, nodos: sinSitio }
    cambiar(d => pegar(d, p.nodos, p.conexiones).dibujo, undefined, pegar(dibujo, p.nodos, p.conexiones).nuevos)
    // el próximo pegado se corre otro tanto
    portapapeles.current = { ...p, nodos: p.nodos.map(n => ({ ...n, x: n.x + 20, y: n.y + 20 })) }
  }
  const rotar = () => {
    const ids = new Set(selN.map(n => n.id))
    cambiar(d => ({ ...d, nodos: d.nodos.map(n => ids.has(n.id) && n.tipo !== 'texto' && n.tipo !== 'recuadro' && n.tipo !== 'sitio' ? { ...n, rot: ((((n.rot ?? 0) + 90) % 360) as Rot) } : n) }))
  }
  const deshacerPaso = () => {
    const r = deshacer(histRef.current, armar())
    if (!r) return
    ponerHist(r.h); ultimo.current = null; setSucio(true); aplicar(r.estado, ref.current.dibId)
  }
  const rehacerPaso = () => {
    const r = rehacer(histRef.current, armar())
    if (!r) return
    ponerHist(r.h); ultimo.current = null; setSucio(true); aplicar(r.estado, ref.current.dibId)
  }

  // Atajos (se reasignan en cada render para leer siempre lo último)
  const atajos = useRef<(e: KeyboardEvent) => void>(() => {})
  atajos.current = e => {
    if (enCampo(e)) return
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); eliminar() }
    else if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? rehacerPaso() : deshacerPaso() }
    else if (ctrl && k === 'y') { e.preventDefault(); rehacerPaso() }
    else if (ctrl && k === 'c') copiar()
    else if (ctrl && k === 'v') { e.preventDefault(); pegarLo() }
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => atajos.current(e)
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  // --- lienzo ---
  const onNodesChange = (cs: NodeChange[]) => {
    const e = ref.current
    // el borrado va por eliminar(): solo posición, selección y medidas
    poner({ ...e, nodes: applyNodeChanges(cs.filter(c => c.type !== 'remove'), e.nodes) })
  }
  const onEdgesChange = (cs: EdgeChange[]) => {
    const e = ref.current
    poner({ ...e, edges: applyEdgeChanges(cs.filter(c => c.type !== 'remove'), e.edges) })
  }
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle || c.source === c.target || !conexionValida(c.sourceHandle, c.targetHandle)) return
    const mismo = (x: Conexion) => (x.desde[0] === c.source && x.desde[1] === c.sourceHandle && x.hasta[0] === c.target && x.hasta[1] === c.targetHandle)
      || (x.hasta[0] === c.source && x.hasta[1] === c.sourceHandle && x.desde[0] === c.target && x.desde[1] === c.targetHandle)
    cambiar(d => d.conexiones.some(mismo) ? d : {
      ...d, conexiones: [...d.conexiones, { id: nuevoId('c', d.conexiones), desde: [c.source, c.sourceHandle!], hasta: [c.target, c.targetHandle!] }],
    })
  }
  const onBarra = useCallback((id: string, largo: number, inicio: boolean) => {
    if (inicio) { pendiente.current = armar(); ultimo.current = null; return }
    cambiar(d => estirarBarra(d, id, largo), null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onTexto = useCallback((id: string, pos: { dx: number; dy: number }, inicio: boolean) => {
    if (inicio) { pendiente.current = armar(); ultimo.current = null; return }
    cambiar(d => {
      const n = d.nodos.find(x => x.id === id), p = n?.posTexto
      if (!n || (typeof p === 'object' && p.dx === pos.dx && p.dy === pos.dy)) return d
      return { ...d, nodos: d.nodos.map(x => x.id === id ? { ...x, posTexto: pos } : x) }
    }, null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Un arrastre deja un paso de deshacer solo si algo se movió
  const finArrastre = () => {
    const antes = pendiente.current
    pendiente.current = null
    if (!antes || JSON.stringify(antes) === JSON.stringify(armar())) return
    ponerHist(registrar(histRef.current, antes)); ultimo.current = null; setSucio(true)
  }

  const nodes = useMemo(() => estado.nodes, [estado.nodes])
  const edges = useMemo(() => estado.edges.map(e => {
    if (e.sourceHandle === 'd') return { ...e, style: { ...ESTILO_DATOS.ok, strokeWidth: e.selected ? 3 : 1.5 } }
    if (esPuntoMedicion(e.sourceHandle)) return { ...e, style: { ...ESTILO_MEDICION, strokeWidth: e.selected ? 3 : ESTILO_MEDICION.strokeWidth } }
    const c = colorDe(res.tramos.get(e.id) ?? 'desconocido', colores)
    return { ...e, style: { stroke: c.stroke, strokeWidth: e.selected ? 5 : 3, strokeDasharray: c.dash } }
  }), [estado.edges, res, colores])

  // --- dibujos (ABM) ---
  const crearSitio = () => {
    const nombre = window.prompt('Nombre del nuevo sitio')?.trim().slice(0, 80)
    if (!nombre) return
    const id = nuevoId('sitio-', data.dibujos.map(d => ({ id: d.id })))
    mutar(u => ({ ...u, dibujos: [...u.dibujos, { id, nombre, tipo: 'sitio', nodos: [], conexiones: [] }] }))
    irA(id)
  }
  const renombrar = () => {
    const nombre = window.prompt('Nombre del dibujo', dibujo.nombre)?.trim().slice(0, 80)
    if (!nombre || nombre === dibujo.nombre) return
    mutar(u => ({ ...u, dibujos: u.dibujos.map(d => d.id === dibujo.id ? { ...d, nombre } : d) }))
  }
  const mover = (dir: -1 | 1) => mutar(u => {
    const i = u.dibujos.findIndex(d => d.id === dibujo.id), j = i + dir, otro = u.dibujos[j]
    if (!otro || otro.tipo === 'general') return u
    const l = [...u.dibujos]; [l[i], l[j]] = [l[j], l[i]]
    return { ...u, dibujos: l }
  })
  const borrarDibujo = () => {
    if (dibujo.tipo === 'general' || !window.confirm(`¿Borrar el dibujo «${dibujo.nombre}»? Los bloques que lo usan también se borran.`)) return
    const id = dibujo.id
    irA('general')
    mutar(u => ({ ...u, dibujos: u.dibujos.filter(d => d.id !== id) }))
  }

  // --- guardar / descartar ---
  const guardar = async () => {
    setGuardando(true); setErrores([]); setConflicto(false)
    try {
      await store.guardar(armar())
      setSucio(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflicto(true)
      else if (e instanceof ApiError && e.errors?.length) setErrores([e.message, ...e.errors])
      else setErrores([(e as Error).message || 'No se pudo guardar'])
    } finally { setGuardando(false) }
  }
  // vuelve a lo guardado (o a lo recién cargado, tras un 409)
  const reiniciar = (u: Unifilar) => {
    const base = structuredClone(u), d = base.dibujos.find(x => x.id === ref.current.dibId) ?? base.dibujos.find(x => x.tipo === 'general')!
    poner({ base, dibId: d.id, ...fusionar([], [], d) })
    ponerHist(historialVacio()); ultimo.current = null; setSucio(false); setErrores([]); setConflicto(false)
  }
  const descartar = () => {
    if (sucio && !window.confirm('¿Descartar los cambios sin guardar?')) return
    reiniciar(useUnifilarStore.getState().data!)
  }
  const recargar = async () => {
    try {
      await store.refrescar()
      reiniciar(useUnifilarStore.getState().data!)
    } catch (e) { setErrores([`No se pudo recargar: ${(e as Error).message}`]) } // el dibujo y el aviso 409 siguen
  }
  const salir = () => { if (!sucio || window.confirm('Hay cambios sin guardar. ¿Salir y perderlos?')) onSalir() }

  const ctx = useMemo(() => ({ vivos, res, colores, dibujos: data.dibujos, resultados, editando: true, onBarra, onTexto }),
    [vivos, res, colores, data.dibujos, resultados, onBarra, onTexto])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {data.dibujos.map(d => (
          <button key={d.id} type="button" onClick={() => irA(d.id)}
            className={`rounded border px-2 py-1 text-xs ${d.id === dibujo.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{d.nombre}</button>
        ))}
        <button type="button" className={bt} onClick={crearSitio} title="Nuevo dibujo de sitio"><Plus className="h-3.5 w-3.5" />Sitio</button>
        <button type="button" className={bt} onClick={renombrar} title="Renombrar"><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" className={bt} onClick={() => mover(-1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" className={bt} onClick={() => mover(1)} title="Bajar"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" className={bt} onClick={borrarDibujo} disabled={dibujo.tipo === 'general'} title={dibujo.tipo === 'general' ? 'La red general no se borra' : 'Borrar dibujo'}><Trash2 className="h-3.5 w-3.5" />Dibujo</button>
        <label className="ml-2 flex items-center gap-1 text-xs">Colores
          <select className="rounded border bg-background px-1 py-1" value={colores}
            onChange={e => mutar(u => ({ ...u, colores: e.target.value as 'portal' | 'ansi' }), 'colores')}>
            <option value="portal">Portal (cerrado = verde)</option>
            <option value="ansi">ANSI (cerrado = rojo)</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={bt} onClick={deshacerPaso} disabled={!hist.pasado.length} title="Deshacer (Ctrl+Z)"><Undo2 className="h-3.5 w-3.5" />Deshacer</button>
        <button type="button" className={bt} onClick={rehacerPaso} disabled={!hist.futuro.length} title="Rehacer (Ctrl+Y)"><Redo2 className="h-3.5 w-3.5" />Rehacer</button>
        <button type="button" className={bt} onClick={copiar} disabled={!selN.length} title="Copiar (Ctrl+C)"><Copy className="h-3.5 w-3.5" />Copiar</button>
        <button type="button" className={bt} onClick={pegarLo} title="Pegar (Ctrl+V)"><ClipboardPaste className="h-3.5 w-3.5" />Pegar</button>
        <button type="button" className={bt} onClick={rotar} disabled={!selN.length} title="Rotar 90°"><RotateCw className="h-3.5 w-3.5" />Rotar</button>
        <button type="button" className={bt} onClick={eliminar} disabled={!selN.length && !selE.length} title="Borrar (Supr)"><Trash2 className="h-3.5 w-3.5" />Borrar</button>
        <button type="button" className={bt} onClick={generar} disabled={dibujo.nodos.length > 0}
          title={dibujo.nodos.length ? 'Solo en un dibujo vacío' : 'Ubica los equipos de Configuración agrupados por sitio, sin conexiones'}><Wand2 className="h-3.5 w-3.5" />Generar desde configuración</button>
        <div className="ml-auto flex items-center gap-1.5">
          {sucio && <span className="text-xs text-amber-500">Cambios sin guardar</span>}
          <button type="button" className={bt} onClick={() => setVerHist(true)} title="Guardados anteriores"><History className="h-3.5 w-3.5" />Historial</button>
          <button type="button" className={bt} onClick={descartar} disabled={!sucio}><Undo className="h-3.5 w-3.5" />Descartar</button>
          <button type="button" className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40" onClick={guardar} disabled={guardando || !sucio}>
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Guardar
          </button>
          <button type="button" className={bt} onClick={salir}><X className="h-3.5 w-3.5" />Salir de edición</button>
        </div>
      </div>
      {verHist && <PanelHistorial vigente={store.version} onCerrar={() => setVerHist(false)}
        onVer={u => { mutar(() => structuredClone(u)); setVerHist(false) }} />}
      {conflicto && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded border border-amber-500 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="font-semibold">El unifilar cambió desde que lo abriste.</span>
          <span>Tu dibujo sigue acá sin guardar; recargar descarta lo que dibujaste y trae la versión nueva.</span>
          <button type="button" className={bt + ' ml-auto'} onClick={recargar}>Recargar y descartar lo mío</button>
        </div>
      )}
      {errores.length > 0 && (
        <div role="alert" className="max-h-32 overflow-y-auto rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <div className="font-semibold">No se guardó: {errores[0]}</div>
          {errores.slice(1).length > 0 && <ul className="list-disc pl-5">{errores.slice(1).map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-2">
        <Paleta onAgregar={t => agregar(t)} haySitios={sitios.length > 0} esGeneral={dibujo.tipo === 'general'} hayPuerto={t => dibujo.nodos.some(n => n.tipo === t)} />
        <div ref={lienzo} className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card"
          onDragOver={e => { if (e.dataTransfer.types.includes('application/unifilar')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
          onDrop={e => {
            const tipo = e.dataTransfer.getData('application/unifilar')
            if (!tipo) return
            e.preventDefault()
            agregar(tipo, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
          }}>
          <UnifilarCtx.Provider value={ctx}>
            <ReactFlow key={dibujo.id} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} colorMode={theme}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              onNodeDragStart={() => { pendiente.current = armar() }} onNodeDragStop={finArrastre}
              onSelectionDragStart={() => { pendiente.current = armar() }} onSelectionDragStop={finArrastre}
              nodesDraggable nodesConnectable elementsSelectable selectNodesOnDrag={false}
              connectionMode={ConnectionMode.Loose} snapToGrid snapGrid={[10, 10]} deleteKeyCode={null}
              isValidConnection={c => c.source !== c.target && conexionValida(c.sourceHandle ?? '', c.targetHandle ?? '')}
              minZoom={0.1} maxZoom={3} fitView fitViewOptions={{ padding: 0.2 }}>
              <Background gap={10} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </UnifilarCtx.Provider>
        </div>
        {nodoSel ? (
          <Propiedades nodo={nodoSel} dibujo={dibujo} general={general} cfg={cfg} sitios={sitios}
            cambiar={(f, clave) => editarNodo(nodoSel.id, f, clave)} />
        ) : (
          <div className="w-64 shrink-0 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
            {selN.length > 1 ? `${selN.length} elementos seleccionados.` : selE.length ? 'Conexión seleccionada.' : 'Elegí un elemento para editar sus propiedades. Arrastrá desde un punto de conexión a otro para unirlos; con Mayús + arrastrar seleccionás varios.'}
          </div>
        )}
      </div>
    </div>
  )
}

// El lienzo necesita su propio proveedor para convertir coordenadas de pantalla
export default function Editor(p: { vivos: Vivos; dibujoInicial?: string; onSalir: () => void }) {
  return <ReactFlowProvider><EditorInterno {...p} /></ReactFlowProvider>
}

