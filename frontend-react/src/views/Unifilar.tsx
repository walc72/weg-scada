import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ReactFlow, Background, Controls, ConnectionMode } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { useNow } from '../lib/useNow'
import { aFlow } from '../lib/unifilar'
import { energizar } from '../lib/energizar'
import type { Resultado, Vivos } from '../lib/energizar'
import { useDrivesStore } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useUnifilarStore } from '../store/unifilar'
import { UnifilarCtx, colorDe } from '../components/unifilar/contexto'
import { nodeTypes } from '../components/unifilar/Simbolos'
import PanelEquipo from '../components/unifilar/PanelEquipo'

const CLICABLES = ['reco', 'reg', 'medidor', 'bomba', 'caudalimetro']

export default function Unifilar() {
  const { id = 'general' } = useParams()
  const { theme } = useTheme()
  const { data, error, cargar } = useUnifilarStore()
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const flowmeters = useDrivesStore(s => s.flowmeters)
  const comms = useDrivesStore(s => s.comms)
  const campo = useDrivesStore(s => s.campo)
  const config = useConfigStore(s => s.config)
  const ahora = useNow()
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => setSel(null), [id])

  const vivos = useMemo<Vivos | null>(
    () => config ? { campo, meters, drives, flowmeters, comms, config, ahora } : null,
    [campo, meters, drives, flowmeters, comms, config, ahora])

  // Energización de todos los dibujos: el general primero (los sitios pueden tomar estado de él)
  const resultados = useMemo(() => {
    const m = new Map<string, Resultado>()
    if (!data || !vivos) return m
    const general = data.dibujos.find(d => d.tipo === 'general')
    const rg = general && energizar(general, vivos)
    if (general && rg) m.set(general.id, rg)
    for (const d of data.dibujos) if (d !== general) m.set(d.id, energizar(d, vivos, general && rg ? { dibujo: general, resultado: rg } : undefined))
    return m
  }, [data, vivos])

  const dibujo = data?.dibujos.find(d => d.id === id)
  const res = dibujo && resultados.get(dibujo.id)
  const colores = data?.colores ?? 'portal'

  const flow = useMemo(() => dibujo ? aFlow(dibujo) : null, [dibujo])
  const nodes = useMemo(() => (flow?.nodes ?? []).map(n => ({
    ...n, draggable: false, selectable: CLICABLES.includes(n.type), ...(n.type === 'recuadro' ? { zIndex: -1 } : {}),
  })) as Node[], [flow])
  const edges = useMemo(() => (flow?.edges ?? []).map(e => {
    const c = colorDe(res?.tramos.get(e.id) ?? 'desconocido', colores)
    return { ...e, type: 'step', selectable: false, style: { stroke: c.stroke, strokeWidth: 3, strokeDasharray: c.dash } }
  }) as Edge[], [flow, res, colores])

  if (error) return <div className="text-center text-destructive text-sm py-16">No se pudo cargar el unifilar: {error}</div>
  if (!data || !vivos) return <div className="flex items-center justify-center py-16 text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Cargando...</div>
  if (!dibujo || !res) return <div className="text-center text-muted-foreground text-sm py-16">No existe el dibujo «{id}». <Link to="/unifilar" className="text-primary underline">Ir a la red general</Link></div>

  const general = data.dibujos.find(d => d.tipo === 'general')
  const nodoSel = dibujo.nodos.find(n => n.id === sel)

  return (
    <div className="flex flex-col gap-3 h-full min-h-[480px]">
      <div className="flex items-center gap-1.5 text-sm">
        {dibujo.tipo === 'general' ? <span className="font-semibold">{dibujo.nombre}</span> : <>
          <Link to="/unifilar" className="text-primary hover:underline">{general?.nombre ?? 'Red general'}</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{dibujo.nombre}</span>
        </>}
      </div>
      <div className="flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
        {dibujo.nodos.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm py-16">Este dibujo todavía no tiene elementos.</div>
        ) : (
          <UnifilarCtx.Provider value={{ vivos, res, colores, dibujos: data.dibujos, resultados }}>
            <ReactFlow key={dibujo.id} nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={theme}
              nodesDraggable={false} nodesConnectable={false} elementsSelectable connectionMode={ConnectionMode.Loose}
              minZoom={0.1} maxZoom={3} fitView fitViewOptions={{ padding: 0.2 }}
              onNodeClick={(_, n) => { if (CLICABLES.includes(n.type ?? '')) setSel(n.id) }}
              onPaneClick={() => setSel(null)}>
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </UnifilarCtx.Provider>
        )}
      </div>
      {nodoSel && <PanelEquipo nodo={nodoSel} vivos={vivos} onClose={() => setSel(null)} />}
    </div>
  )
}
