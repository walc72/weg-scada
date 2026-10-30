import { lazy, Suspense, useEffect, Component, type ReactNode, type ErrorInfo } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Factory, LineChart, Settings, Sun, Moon, FileText, LogOut, Waves, ShieldCheck, Eye, Lock, WifiOff, Bell, RadioTower, Network } from 'lucide-react'
import StatusBar from './components/StatusBar'
import { useTheme } from './lib/theme'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'
import { useDrivesStore } from './store/drives'
import { useConfigStore } from './store/config'
import { useAuthStore, isAdminRole, ROLE_LABEL } from './store/auth'
import { useBrandingStore } from './store/branding'
import { useServerStore } from './store/server'
import { useLicense, motivoTexto } from './store/license'
import { useBackup } from './store/backup'
import { Card } from './components/ui/card'
import ReplicaBadge from './components/ReplicaBadge'
import Dashboard from './views/Dashboard'
import Login from './views/Login'

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('[RouteErrorBoundary]', e, info) }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-destructive py-16">
          <div className="text-lg font-bold">Error al cargar la vista</div>
          <pre className="text-xs bg-muted p-3 rounded max-w-xl overflow-auto">{msg}</pre>
          <button className="text-xs underline" onClick={() => this.setState({ error: null })}>Reintentar</button>
        </div>
      )
    }
    return this.props.children
  }
}

const Historicos    = lazy(() => import('./views/Historicos'))
const FormaOnda     = lazy(() => import('./views/FormaOnda'))
const Reportes      = lazy(() => import('./views/Reportes'))
const Alarmas       = lazy(() => import('./views/Alarmas'))
const Config        = lazy(() => import('./views/Config'))
const Comunicaciones = lazy(() => import('./views/Comunicaciones'))
const Unifilar      = lazy(() => import('./views/Unifilar'))
const MotorDetalle  = lazy(() => import('./views/MotorDetalle'))
const Equipos       = lazy(() => import('./views/Equipos'))

const navItems: { to: string; label: string; icon: React.ElementType; adminOnly: boolean; module?: string }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/equipos', label: 'Equipos', icon: Factory, adminOnly: false },
  { to: '/alarmas', label: 'Alarmas', icon: Bell, adminOnly: false },
  { to: '/historicos', label: 'Tendencias', icon: LineChart, adminOnly: false },
  { to: '/forma-onda', label: 'Forma de Onda', icon: Waves, adminOnly: false, module: 'medidores' },
  { to: '/reportes', label: 'Reportes', icon: FileText, adminOnly: false },
  { to: '/unifilar', label: 'Unifilar', icon: Network, adminOnly: false, module: 'unifilar' },
  { to: '/comunicaciones', label: 'Comunicaciones', icon: RadioTower, adminOnly: false, module: 'comunicaciones' },
  { to: '/config', label: 'Configuración', icon: Settings, adminOnly: true }
]

// Vista para operador que intenta entrar a una ruta solo-admin
function NoAutorizado() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
      <Lock className="h-10 w-10 opacity-40" />
      <div className="text-lg font-semibold">Acceso restringido</div>
      <p className="text-sm">La Configuración solo está disponible para el rol administrador.</p>
    </div>
  )
}

export default function App() {
  const { theme, toggle } = useTheme()
  const connect = useDrivesStore(s => s.connect)
  const disconnect = useDrivesStore(s => s.disconnect)
  const connected = useDrivesStore(s => s.connected)
  const loadConfig = useConfigStore(s => s.load)
  const configLoaded = useConfigStore(s => s.config)
  const authed = useAuthStore(s => s.authed)
  const logout = useAuthStore(s => s.logout)
  const role = useAuthStore(s => s.role)
  const user = useAuthStore(s => s.user)
  const isAdmin = isAdminRole(role)
  const hasModule = useLicense(s => s.hasModule)
  const lic = useLicense(s => s.lic)
  const visibleNav = navItems.filter(i => (!i.adminOnly || isAdmin) && (!i.module || hasModule(i.module)))
  const logoUrl = useBrandingStore(s => s.logoUrl)
  const brandName = useBrandingStore(s => s.name)

  // Marca pública: se carga una vez, antes del login
  useEffect(() => { useBrandingStore.getState().load() }, [])

  const replica = useServerStore(s => s.replica)
  useEffect(() => { if (authed) { useServerStore.getState().load(); useLicense.getState().load() } }, [authed])

  // Aviso de backup con errores: solo admin/superadmin con el módulo, fuera de réplica (la pestaña Backups recarga el estado)
  const backupVisible = authed && isAdmin && !!lic && hasModule('backup') && !replica
  useEffect(() => { if (backupVisible) useBackup.getState().load() }, [backupVisible])
  const backupUltima = useBackup(s => s.info?.estado?.ultima)
  const backupErr = backupVisible ? (['config', 'historico'] as const).filter(p => backupUltima?.[p]?.ok === false && backupUltima?.[p]?.error !== 'otro backup en curso') : [] // salteado por lock: no es error

  // Conectar MQTT y cargar config solo con sesion activa (issues #3/#4 de la
  // revision): antes corria una vez pre-login (config daba 401 y nunca se
  // recargaba) y el websocket quedaba abierto incluso deslogueado.
  useEffect(() => {
    if (!authed) return
    connect()
    if (!configLoaded) loadConfig()
    return () => disconnect()
  }, [authed])

  if (!authed) return <Login />

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Encabezado: marca + estado de planta (alarmas, comunicación, hora) */}
      <header className="border-b bg-card shrink-0 z-20">
        <div className="min-h-[52px] px-4 py-2 flex items-center gap-x-4 gap-y-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="bg-white border border-border px-2 py-1 flex items-center">
              <img src={logoUrl} alt={brandName} className="h-6 w-auto max-w-[140px] object-contain" />
            </div>
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-[13px] font-bold tracking-widest">PLANTA DE BOMBEO</span>
              <span className="text-[11px] text-muted-foreground tracking-wider">SCADA · MONITOREO</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
            {replica && <ReplicaBadge />}
            {/* Solo se muestra lo anormal: la conexión caída */}
            {!connected && (
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold blink" style={{ background: 'var(--st-com)', color: '#16191C' }}>
                <WifiOff className="h-3 w-3" />RECONECTANDO
              </div>
            )}
            <StatusBar backupErr={backupErr.length > 0} />
            <div className="flex items-center gap-1 pl-3 border-l border-border">
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium mr-1" title={`Sesión: ${user} (${role})`}>
                {isAdmin ? <ShieldCheck className="h-3.5 w-3.5 text-primary" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-foreground">{user}</span>
                <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 tracking-wider uppercase">{ROLE_LABEL[role] || 'Operador'}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={toggle} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={logout} title="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <nav className="flex overflow-x-auto px-2 border-t border-border" aria-label="Navegación principal">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-4 min-h-[44px] text-xs font-semibold tracking-widest uppercase whitespace-nowrap border-b-[3px] transition-colors',
                  isActive
                    ? 'border-foreground text-foreground bg-muted'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )
              }
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 p-3 sm:p-4 overflow-auto">
            {lic && !lic.ok && (
              <Card className="px-4 py-2.5 mb-4 text-sm font-medium" style={{ borderColor: 'var(--p2)' }}>
                {replica ? 'La licencia de planta no incluye réplica o todavía no se bajó' : `Sin licencia (${motivoTexto(lic.motivo)})`}
              </Card>
            )}
            <RouteErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Cargando...</div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/equipos" element={<Equipos />} />
                <Route path="/motor/:name" element={<MotorDetalle />} />
                <Route path="/historicos" element={<Historicos />} />
                <Route path="/forma-onda" element={<FormaOnda />} />
                <Route path="/reportes" element={<Reportes />} />
                <Route path="/alarmas" element={<Alarmas />} />
                <Route path="/comunicaciones" element={<Comunicaciones />} />
                <Route path="/unifilar" element={<Unifilar />} />
                <Route path="/unifilar/:id" element={<Unifilar />} />
                <Route path="/config" element={isAdmin ? <Config /> : <NoAutorizado />} />
              </Routes>
            </Suspense>
            </RouteErrorBoundary>
          </main>
          <footer className="h-6 border-t px-4 flex items-center justify-end text-[11px] text-muted-foreground bg-card shrink-0">
            Powered By <strong className="ml-1">Tecno Electric S.A.</strong>
          </footer>
        </div>
      </div>
    </div>
  )
}
