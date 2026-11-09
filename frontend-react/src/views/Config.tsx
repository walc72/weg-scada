import { useEffect, type JSX } from 'react'
import { useConfigStore } from '../store/config'
import { useAuthStore } from '../store/auth'
import { SkeletonTabla } from '../components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import BrandingTab from './config/BrandingTab'
import ConexionTab from './config/ConexionTab'
import ReplicasTab from './config/ReplicasTab'
import LicenciaTab from './config/LicenciaTab'
import ZonasTab from './config/ZonasTab'
import AlarmasTab from './config/AlarmasTab'
import BalanceTab from './config/BalanceTab'
import UsuariosTab from './config/UsuariosTab'
import CorreoTab from './config/CorreoTab'
import BackupsTab from './config/BackupsTab'
import BombasTab from './config/BombasTab'
import MedidoresTab from './config/MedidoresTab'
import GatewaysTab from './config/GatewaysTab'
import CaudalimetrosTab from './config/CaudalimetrosTab'
import CampoTab from './config/CampoTab'
import GeneradoresTab from './config/GeneradoresTab'
import EnlacesTab from './config/EnlacesTab'
import { useSearchParams } from 'react-router'
import { useLicense } from '../store/license'
import { useServerStore } from '../store/server'

export default function Config() {
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

  useEffect(() => { if (!store.config) store.load() }, [])

  // Sin gate de contraseña propio: la ruta /config ya es solo-admin (por rol).

  if (store.error) {
    return <div className="text-center text-destructive py-16">Error al cargar configuración: {store.error}</div>
  }

  if (!store.config) {
    return <SkeletonTabla filas={8} />
  }

  // Grupos con subpestañas; ?tab= sigue siendo la subpestaña (los enlaces viejos, como ?tab=backups, siguen andando)
  const equipo = (el: JSX.Element) => <fieldset disabled={replica} className="min-w-0">{el}</fieldset>
  const soloLectura = (el: JSX.Element) => <fieldset disabled={replica} className="min-w-0">{el}</fieldset>
  const GRUPOS: { id: string; label: string; subs: { id: string; label: string; el: JSX.Element }[] }[] = [
    { id: 'equipos', label: 'Equipos', subs: [
      { id: 'devices', label: 'Bombas', el: equipo(<BombasTab />) },
      { id: 'meters', label: 'Medidores', el: equipo(<MedidoresTab />) },
      { id: 'gateways', label: 'Gateways', el: equipo(<GatewaysTab />) },
      ...(caudales ? [{ id: 'flow', label: 'Caudalímetros', el: equipo(<CaudalimetrosTab />) }] : []),
      ...(unifilar ? [{ id: 'campo', label: 'Reconectadores y reguladores', el: equipo(<CampoTab />) }] : []),
      ...(generadores ? [{ id: 'generadores', label: 'Generadores', el: equipo(<GeneradoresTab />) }] : []),
      ...(comms ? [{ id: 'comms', label: 'Enlaces', el: equipo(<EnlacesTab />) }] : []),
    ] },
    { id: 'supervision', label: 'Supervisión', subs: [
      { id: 'zones', label: 'Zonas de gauges', el: soloLectura(<ZonasTab />) },
      { id: 'alarms', label: 'Alarmas', el: soloLectura(<AlarmasTab />) },
      { id: 'balance', label: 'Balance', el: soloLectura(<BalanceTab />) },
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
  const ir = (t: string) => setParams({ tab: t }, { replace: true })

  return (
    <Tabs value={grupo.id} onValueChange={g => ir(GRUPOS.find(x => x.id === g)!.subs[0].id)} className="space-y-4">
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
