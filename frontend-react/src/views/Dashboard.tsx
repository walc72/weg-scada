import { useMemo, type ComponentType } from 'react'
import { useDrivesStore, selectDriveList, selectMeterList } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useLicense } from '../store/license'
import { usePrefs } from '../store/prefs'
import { useDailyStats } from '@/lib/useDailyEnergy'
import { agruparPorSitio } from '@/lib/sitios'
import { CATALOGO, layoutEfectivo, type Ancho, type TipoGadget } from '@/lib/gadgets'
import { SkeletonVista } from '../components/ui/skeleton'
import GadgetMarco, { DatosDashboardCtx, type GadgetProps } from '../components/dashboard/GadgetMarco'
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
// Clases literales: Tailwind solo genera las que ve escritas
const SPAN: Record<Ancho, string> = { 4: 'md:col-span-4', 6: 'md:col-span-6', 8: 'md:col-span-8', 12: 'md:col-span-12' }
const lista = (s: string) => (s ? s.split('\n') : [])

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

  const driveList = useMemo(() => selectDriveList(drives), [drives])
  const meterList = useMemo(() => hasMedidores ? selectMeterList(meters) : [], [meters, hasMedidores])
  // Datos del día por equipo (mismo cálculo que el Reporte Diario; en demo, estimados)
  const daily = useDailyStats(driveList, meterList)
  const datos = useMemo(() => ({ driveList, meterList, daily }), [driveList, meterList, daily])

  // Contexto del saneo como texto: el layout no se recalcula con cada dato en vivo
  const medidores = (config?.meters ?? []).map(m => m.name).join('\n')
  const sitios = agruparPorSitio(driveList, config?.devices ?? []).flatMap(g => (g.sitio ? [g.sitio] : [])).join('\n')
  const graficos = (misGraficos ?? []).map(g => g.id).join('\n')
  const layout = useMemo(
    () => layoutEfectivo(dashboard, defecto, { hasModule, medidores: lista(medidores), sitios: lista(sitios), graficos: lista(graficos) }),
    // `lic` a propósito: hasModule es la misma función aunque cambie la licencia
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboard, defecto, hasModule, lic, medidores, sitios, graficos],
  )

  // Hasta que llegan la config, los primeros datos y las preferencias: esqueleto en vez de ceros
  if (!config || (driveList.length === 0 && meterList.length === 0) || estado === 'cargando') return <SkeletonVista />

  return (
    <DatosDashboardCtx.Provider value={datos}>
      <div className="grid grid-cols-12 gap-4">
        {layout.items.map(it => {
          const G = GADGETS[it.tipo]
          // `empty:hidden`: un gadget sin nada que mostrar (p. ej. sin alarmas) no deja hueco
          return (
            <div key={it.id} className={`col-span-12 ${SPAN[it.ancho]} min-w-0 empty:hidden`}>
              <GadgetMarco titulo={CATALOGO[it.tipo].titulo} sinMarco={SIN_MARCO.has(it.tipo)}>
                <G opciones={it.opciones ?? {}} editando={false} />
              </GadgetMarco>
            </div>
          )
        })}
      </div>
    </DatosDashboardCtx.Provider>
  )
}
