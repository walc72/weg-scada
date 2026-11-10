import { useEffect, type JSX } from 'react'
import { useConfigStore } from '../../store/config'
import { useAuthStore } from '../../store/auth'
import { SkeletonTabla } from '../../components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs'
import BrandingTab from './BrandingTab'
import ConexionTab from './ConexionTab'
import ReplicasTab from './ReplicasTab'
import LicenciaTab from './LicenciaTab'
import ZonasTab from './ZonasTab'
import AlarmasTab from './AlarmasTab'
import BalanceTab from './BalanceTab'
import TarifasTab from './TarifasTab'
import UsuariosTab from './UsuariosTab'
import CorreoTab from './CorreoTab'
import BackupsTab from './BackupsTab'
import BombasTab from './BombasTab'
import MedidoresTab from './MedidoresTab'
import GatewaysTab from './GatewaysTab'
import CaudalimetrosTab from './CaudalimetrosTab'
import CampoTab from './CampoTab'
import GeneradoresTab from './GeneradoresTab'
import EnlacesTab from './EnlacesTab'
import { useSearchParams } from 'react-router'
import { useLicense } from '../../store/license'
import { useServerStore } from '../../store/server'
import { useAvisoSalida } from '../../components/config'

// ponytail: estado de módulo (hay una sola ConfigView montada); pasar a useRef si eso cambia
let ultimoIr = { t: '', at: 0 }

export default function ConfigView() {
  const store = useConfigStore()
  const replica = useServerStore(s => s.replica)
  // Marca, Conexión y Réplicas: solo el superadmin
  const superadmin = useAuthStore(s => s.role === 'superadmin')
  // Backups: admin/superadmin (la ruta ya es solo-admin), con módulo, fuera de réplica
  const backups = useLicense(l => l.hasModule('backup')) && !replica
  const caudales = useLicense(l => l.hasModule('caudales'))
  const unifilar = useLicense(l => l.hasModule('unifilar'))
  const generadores = useLicense(l => l.hasModule('generadores'))
  const comms = useLicense(l => l.hasModule('comunicaciones'))
  // ?tab=… permite enlazar a una pestaña (p. ej. el aviso de backup de la App)
  const [params, setParams] = useSearchParams()
  const { confirmarSalida } = useAvisoSalida()

  useEffect(() => { if (!store.config) store.load() }, [])

  // Sin gate de contraseña propio: la ruta /config ya es solo-admin (por rol).

  // Con config ya cargada (falló una recarga tras un guardado) no se desmontan las pestañas ni lo editado
  if (store.error && !store.config) {
    return <div className="text-center text-destructive py-16">Error al cargar configuración: {store.error}</div>
  }

  if (!store.config) {
    return <SkeletonTabla filas={8} />
  }

  // Grupos con subpestañas; ?tab= sigue siendo la subpestaña (los enlaces viejos, como ?tab=backups, siguen andando)
  // En réplica, lo que se sincroniza desde planta (equipos y supervisión) es solo lectura
  const soloLectura = (el: JSX.Element) => <fieldset disabled={replica} className="min-w-0">{el}</fieldset>
  const GRUPOS: { id: string; label: string; subs: { id: string; label: string; el: JSX.Element }[] }[] = [
    { id: 'equipos', label: 'Equipos', subs: [
      { id: 'devices', label: 'Bombas', el: soloLectura(<BombasTab />) },
      { id: 'meters', label: 'Medidores', el: soloLectura(<MedidoresTab />) },
      { id: 'gateways', label: 'Gateways', el: soloLectura(<GatewaysTab />) },
      ...(caudales ? [{ id: 'flow', label: 'Caudalímetros', el: soloLectura(<CaudalimetrosTab />) }] : []),
      ...(unifilar ? [{ id: 'campo', label: 'Reconectadores y reguladores', el: soloLectura(<CampoTab />) }] : []),
      ...(generadores ? [{ id: 'generadores', label: 'Generadores', el: soloLectura(<GeneradoresTab />) }] : []),
      ...(comms ? [{ id: 'comms', label: 'Enlaces', el: soloLectura(<EnlacesTab />) }] : []),
    ] },
    { id: 'supervision', label: 'Supervisión', subs: [
      { id: 'zones', label: 'Zonas de gauges', el: soloLectura(<ZonasTab />) },
      { id: 'alarms', label: 'Alarmas', el: soloLectura(<AlarmasTab />) },
      { id: 'balance', label: 'Balance', el: soloLectura(<BalanceTab />) },
      { id: 'tarifas', label: 'Tarifas', el: <TarifasTab /> },
    ] },
    { id: 'acceso', label: 'Usuarios y correo', subs: [
      { id: 'users', label: 'Usuarios', el: <UsuariosTab /> },
      { id: 'smtp', label: 'Correo', el: <CorreoTab /> },
    ] },
    { id: 'sistema', label: 'Sistema', subs: [
      { id: 'licencia', label: 'Licencia', el: <LicenciaTab /> },
      ...(backups ? [{ id: 'backups', label: 'Backups', el: <BackupsTab /> }] : []),
      ...(superadmin ? [{ id: 'brand', label: 'Marca', el: <BrandingTab /> }, { id: 'conexion', label: 'Conexión', el: <ConexionTab /> }] : []),
      ...(superadmin && !replica ? [{ id: 'replicas', label: 'Réplicas', el: <ReplicasTab /> }] : []),
    ] },
  ]
  const tab = params.get('tab') || 'devices'
  const grupo = GRUPOS.find(g => g.subs.some(s => s.id === tab)) || GRUPOS[0]
  const sub = grupo.subs.find(s => s.id === tab) || grupo.subs[0]
  // Con cambios sin guardar, cambiar de grupo o subpestaña pide confirmación (desmonta la edición)
  // Radix pide el cambio en mousedown y otra vez en focus: el segundo pedido del mismo clic se ignora
  // para que el aviso no salga dos veces (aceptado o rechazado)
  const ir = (t: string) => {
    if (t === sub.id || (ultimoIr.t === t && performance.now() - ultimoIr.at < 500)) return
    const ok = confirmarSalida()
    ultimoIr = { t, at: performance.now() } // después del confirm: el diálogo nativo puede tardar
    if (ok) setParams({ tab: t }, { replace: true })
  }

  return (
    <Tabs value={grupo.id} onValueChange={g => { if (g !== grupo.id) ir(GRUPOS.find(x => x.id === g)!.subs[0].id) }} className="space-y-4">
      <TabsList>
        {GRUPOS.map(g => <TabsTrigger key={g.id} value={g.id}>{g.label}</TabsTrigger>)}
      </TabsList>

      {replica && (
        <div className="border bg-muted/40 px-3 py-2 text-sm">
          Servidor réplica: equipos, zonas y balance se sincronizan desde planta y son solo lectura.
          Usuarios, correo y marca son de este servidor.
        </div>
      )}
      {/* fieldset disabled deshabilita inputs/botones (incl. Switch/Select de Radix, que son <button>) */}
      {GRUPOS.map(g => (
        <TabsContent key={g.id} value={g.id} className="mt-0">
          <Tabs value={sub.id} onValueChange={ir}>
            <TabsList aria-label={`Secciones de ${g.label}`} className="border-t-0 bg-muted/30">
              {g.subs.map(s => (
                <TabsTrigger key={s.id} value={s.id} className="min-h-[36px] px-3 text-[11px] tracking-wider normal-case data-[state=active]:bg-card">{s.label}</TabsTrigger>
              ))}
            </TabsList>
            {g.subs.map(s => <TabsContent key={s.id} value={s.id}>{s.el}</TabsContent>)}
          </Tabs>
        </TabsContent>
      ))}
    </Tabs>
  )
}
