import { useMemo, useRef, useState, type ComponentType } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, pointerWithin, useSensor, useSensors, type Announcements, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useLicense } from '../store/license'
import { usePrefs } from '../store/prefs'
import { useAuthStore } from '../store/auth'
import { useDailyStats } from '@/lib/useDailyEnergy'
import { CATALOGO, disponiblesParaAgregar, layoutEfectivo, paraPredeterminado, sitiosConfig, mover, moverA, nuevoItem, vecinoPorTecla, type Ancho, type ItemGadget, type Layout, type TipoGadget } from '@/lib/gadgets'
import { SkeletonVista } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { ConfirmarDialog } from '../components/ui/confirmar-dialog'
import { BarraGuardado, useAvisoSalida, useEdicion, useGuardando } from '../components/config'
import GadgetMarco, { DatosDashboardCtx, type GadgetProps } from '../components/dashboard/GadgetMarco'
import EdicionGadget, { useTituloGadget } from '../components/dashboard/EdicionGadget'
import CatalogoDialog from '../components/dashboard/CatalogoDialog'
import OpcionesDialog from '../components/dashboard/OpcionesDialog'
import Alarmas from '../components/dashboard/Alarmas'
import Indicadores from '../components/dashboard/Indicadores'
import Bombas from '../components/dashboard/Bombas'
import Medidor from '../components/dashboard/Medidor'
import Generadores from '../components/dashboard/Generadores'
import Tendencia from '../components/dashboard/Tendencia'
import MisGrafico from '../components/dashboard/MisGrafico'

// Las opciones ya vienen saneadas por el catálogo con la forma que espera cada gadget
const GADGETS = { alarmas: Alarmas, kpis: Indicadores, bombas: Bombas, medidor: Medidor, generadores: Generadores, tendencia: Tendencia, misGrafico: MisGrafico } as unknown as
  Record<TipoGadget, ComponentType<GadgetProps<Record<string, unknown>>>>
// Sin tarjeta del Dashboard: conservan su aspecto actual o ya traen su propia tarjeta con título
const SIN_MARCO = new Set<TipoGadget>(['alarmas', 'kpis', 'bombas', 'medidor', 'tendencia', 'misGrafico'])
const SIN_OPCIONES = new Set<TipoGadget>(['alarmas', 'generadores'])
// Clases literales: Tailwind solo genera las que ve escritas
const SPAN: Record<Ancho, string> = { 4: 'md:col-span-4', 6: 'md:col-span-6', 8: 'md:col-span-8', 12: 'md:col-span-12' }
const lista = (s: string) => (s ? s.split('\n') : [])
const INSTRUCCIONES = { draggable: 'Para mover un gadget, presioná Espacio o Enter, usá las flechas y volvé a presionar Espacio o Enter para soltarlo; Escape cancela.' }
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Confirmacion = 'restablecer' | 'defecto' | 'quitarDefecto'
const CONFIRMAR: Record<Confirmacion, { titulo: string; mensaje: string; textoConfirmar: string; peligro?: boolean }> = {
  restablecer: { titulo: 'Restablecer', mensaje: '¿Volver al Dashboard predeterminado? Se borra tu personalización.', textoConfirmar: 'RESTABLECER', peligro: true },
  defecto: { titulo: 'Guardar como predeterminado', mensaje: 'Lo verán los usuarios que no personalizaron su Dashboard. Los gadgets de Mis gráficos no se incluyen porque son personales.', textoConfirmar: 'GUARDAR' },
  quitarDefecto: { titulo: 'Quitar predeterminado', mensaje: 'Los usuarios que no personalizaron su Dashboard vuelven al de fábrica.', textoConfirmar: 'QUITAR', peligro: true },
}

// Vista general de sala de control armada con gadgets según el layout del usuario
// (propio → predeterminado del admin → el de fábrica). El detalle por equipo está en Equipos.
export default function Dashboard() {
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const config = useConfigStore(s => s.config)
  const lic = useLicense(s => s.lic)
  const hasModule = useLicense(s => s.hasModule)
  const hasMedidores = useLicense(s => s.hasModule('medidores'))
  const estado = usePrefs(s => s.estado)
  const dashboard = usePrefs(s => s.dashboard)
  const defecto = usePrefs(s => s.defecto)
  const misGraficos = usePrefs(s => s.misGraficos)
  const guardarPref = usePrefs(s => s.guardar)
  const borrarPref = usePrefs(s => s.borrar)
  const guardarDefecto = usePrefs(s => s.guardarDefecto)
  const borrarDefecto = usePrefs(s => s.borrarDefecto)
  const tituloGadget = useTituloGadget()
  const isAdmin = useAuthStore(s => s.isAdmin())

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const meterList = useMemo(() => hasMedidores ? selectMeterList(meters) : [], [meters, hasMedidores])
  // Datos del día por equipo (mismo cálculo que el Reporte Diario; en demo, estimados)
  const daily = useDailyStats(driveList, meterList)
  const datos = useMemo(() => ({ driveList, meterList, daily }), [driveList, meterList, daily])

  // Contexto del saneo como texto: el layout no se recalcula con cada dato en vivo
  const medidores = (config?.meters ?? []).map(m => m.name).join('\n')
  const sitios = sitiosConfig(config?.devices ?? []).join('\n')
  const graficos = (misGraficos ?? []).map(g => g.id).join('\n')
  const ctx = useMemo(
    () => ({ hasModule, medidores: lista(medidores), sitios: lista(sitios), graficos: lista(graficos) }),
    // `lic` a propósito: hasModule es la misma función aunque cambie la licencia
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasModule, lic, medidores, sitios, graficos],
  )
  const layout = useMemo(() => layoutEfectivo(dashboard, defecto, ctx), [dashboard, defecto, ctx])

  // ─── Modo edición ───
  // useEdicion adopta un original nuevo solo sin cambios locales: por eso el layout memoizado
  const ed = useEdicion<Layout>(layout)
  useAvisoSalida()
  const [editando, setEditando] = useState(false)
  const [catalogo, setCatalogo] = useState(false)
  const [opciones, setOpciones] = useState<ItemGadget | null>(null)
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null)
  const [guardando, correr] = useGuardando()
  // Flechas del teclado: salta al gadget vecino en el orden de la lista (sortableKeyboardCoordinates no
  // se arregla con tamaños tan distintos). El destino queda en un ref y `colision` lo devuelve tal cual
  // (alinear esquinas no alcanza cuando los tamaños difieren mucho); las flechas siguientes parten de ahí.
  const destinoTeclado = useRef<string | null>(null)
  const tecladoPorOrden: KeyboardCoordinateGetter = (event, { active, currentCoordinates, context }) => {
    const destino = vecinoPorTecla(items.map(it => it.id), destinoTeclado.current ?? String(context.over?.id ?? active), event.code)
    const rect = destino === null ? undefined : context.droppableRects.get(destino)
    if (destino === null || !rect || !context.collisionRect) return
    event.preventDefault()
    destinoTeclado.current = destino
    return { x: currentCoordinates.x + rect.left - context.collisionRect.left, y: currentCoordinates.y + rect.top - context.collisionRect.top }
  }
  // Teclado: el destino fijado. Puntero: el gadget bajo el cursor, y si no hay ninguno, el de esquinas más cercanas
  const colision: CollisionDetection = args => {
    const id = destinoTeclado.current
    if (id !== null) return [{ id }]
    const bajo = pointerWithin(args)
    return bajo.length ? bajo : closestCorners(args)
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: tecladoPorOrden }),
  )

  // f devuelve el ítem cambiado, o null para quitarlo
  const cambiar = (id: string, f: (it: ItemGadget) => ItemGadget | null) =>
    ed.set(v => ({ ...v, items: v.items.flatMap(it => { if (it.id !== id) return [it]; const n = f(it); return n ? [n] : [] }) }))
  const agregar = (tipo: TipoGadget) => {
    const it = nuevoItem(tipo)
    if (tipo === 'misGrafico') it.opciones = { grafico: ctx.graficos[0] ?? '' } // el primero, en vez de «ya no existe»
    ed.set(v => ({ ...v, items: [...v.items, it] }))
    setCatalogo(false)
  }
  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    ed.set(v => moverA(v, v.items.findIndex(x => x.id === active.id), v.items.findIndex(x => x.id === over.id)))
  }
  const guardar = () => correr(async () => {
    const ok = await ed.guardar(async v => {
      try { await guardarPref('dashboard', v); return true } catch (e) { toast.error(`No se pudo guardar: ${msg(e)}`); return false }
    })
    if (ok) toast.success('Guardado')
  })
  // Si falla, la edición se conserva (el toast explica)
  const confirmado = () => correr(async () => {
    const c = confirmar
    setConfirmar(null)
    try {
      if (c === 'restablecer') { await borrarPref('dashboard'); ed.descartar() }
      else if (c === 'defecto') await guardarDefecto(paraPredeterminado(ed.valor))
      else if (c === 'quitarDefecto') await borrarDefecto()
      toast.success('Guardado')
    } catch (e) { toast.error(`No se pudo guardar: ${msg(e)}`) }
  })

  // Hasta que llegan la config, los primeros datos y las preferencias: esqueleto en vez de ceros
  if (!config || (driveList.length === 0 && meterList.length === 0) || estado === 'cargando') return <SkeletonVista />

  const items = (editando ? ed.valor : layout).items
  // Avisos del arrastre para lectores de pantalla, con el título del gadget
  const titulo = (id: UniqueIdentifier) => { const it = items.find(x => x.id === id); return it ? tituloGadget(it) : '' }
  const pos = (id: UniqueIdentifier) => items.findIndex(x => x.id === id) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Se tomó ${titulo(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${titulo(active.id)} se movió a la posición ${pos(over.id)} de ${items.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Se soltó ${titulo(active.id)} en la posición ${pos(over.id)}.` : `Se soltó ${titulo(active.id)}.`),
    onDragCancel: () => 'Se canceló el movimiento.',
  }
  const contenido = (it: ItemGadget) => {
    const G = GADGETS[it.tipo]
    return (
      <GadgetMarco titulo={CATALOGO[it.tipo].titulo} sinMarco={SIN_MARCO.has(it.tipo)}>
        <G opciones={it.opciones ?? {}} editando={editando} />
      </GadgetMarco>
    )
  }

  return (
    <DatosDashboardCtx.Provider value={datos}>
      <div className="space-y-4">
        <div className="flex flex-wrap justify-end gap-2">
          {!editando ? (
            // el title va en un span: el Button deshabilitado tiene pointer-events-none y no muestra tooltip
            <span className="inline-flex" title={estado === 'error' ? 'No se pudieron cargar tus preferencias' : undefined}>
              <Button variant="outline" size="sm" disabled={estado === 'error'} onClick={() => setEditando(true)}>PERSONALIZAR</Button>
            </span>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setCatalogo(true)}>AGREGAR GADGET</Button>
              <Button variant="outline" size="sm" disabled={dashboard === null || guardando} onClick={() => setConfirmar('restablecer')}>RESTABLECER</Button>
              {isAdmin && <Button variant="outline" size="sm" disabled={guardando} onClick={() => setConfirmar('defecto')}>GUARDAR COMO PREDETERMINADO</Button>}
              {isAdmin && defecto && <Button variant="outline" size="sm" disabled={guardando} onClick={() => setConfirmar('quitarDefecto')}>QUITAR PREDETERMINADO</Button>}
              {/* con cambios no sale: primero GUARDAR o DESCARTAR en la barra */}
              <span className="inline-flex" title={ed.sucio ? 'Guardá o descartá los cambios' : undefined}>
                <Button size="sm" disabled={ed.sucio} onClick={() => setEditando(false)}>LISTO</Button>
              </span>
            </>
          )}
        </div>

        {!editando ? (
          <div className="grid grid-cols-12 gap-4">
            {/* `empty:hidden`: un gadget sin nada que mostrar (p. ej. sin alarmas) no deja hueco */}
            {items.map(it => <div key={it.id} className={`col-span-12 ${SPAN[it.ancho]} min-w-0 empty:hidden`}>{contenido(it)}</div>)}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={colision} onDragStart={() => { destinoTeclado.current = null }} onDragCancel={() => { destinoTeclado.current = null }} onDragEnd={e => { destinoTeclado.current = null; alSoltar(e) }} accessibility={{ announcements, screenReaderInstructions: INSTRUCCIONES }}>
            <SortableContext items={items.map(it => it.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-4">
                {items.map((it, i) => (
                  <EdicionGadget key={it.id} item={it} className={`col-span-12 ${SPAN[it.ancho]} min-w-0`}
                    primero={i === 0} ultimo={i === items.length - 1} conOpciones={!SIN_OPCIONES.has(it.tipo)}
                    onMover={d => ed.set(v => mover(v, it.id, d))} onAncho={ancho => cambiar(it.id, x => ({ ...x, ancho }))}
                    onOpciones={() => setOpciones(it)} onQuitar={() => cambiar(it.id, () => null)}>
                    {contenido(it)}
                  </EdicionGadget>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {editando && items.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay gadgets. Usá «AGREGAR GADGET».</p>}
        {ed.sucio && (
          <div className="sticky bottom-0 bg-background pb-3">
            <BarraGuardado sucio guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
          </div>
        )}
      </div>

      <CatalogoDialog open={catalogo} disponibles={disponiblesParaAgregar(ed.valor, ctx)} onAgregar={agregar} onCerrar={() => setCatalogo(false)} />
      <OpcionesDialog key={opciones?.id ?? ''} item={opciones} sitios={ctx.sitios} onCancelar={() => setOpciones(null)}
        onAplicar={o => { if (opciones) cambiar(opciones.id, x => ({ ...x, opciones: o })); setOpciones(null) }} />
      {confirmar && <ConfirmarDialog open {...CONFIRMAR[confirmar]} onConfirmar={confirmado} onCancelar={() => setConfirmar(null)} />}
    </DatosDashboardCtx.Provider>
  )
}
