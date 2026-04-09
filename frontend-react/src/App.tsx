import { useState, useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, LineChart, Settings, Sun, Moon, Menu, FileText, ClipboardList } from 'lucide-react'
import { useTheme } from './lib/theme'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'
import { useDrivesStore } from './store/drives'
import { useConfigStore } from './store/config'
import Dashboard from './views/Dashboard'
import Historicos from './views/Historicos'
import Reportes from './views/Reportes'
import ReporteDiario from './views/ReporteDiario'
import Config from './views/Config'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/historicos', label: 'Históricos', icon: LineChart },
  { to: '/reportes', label: 'Reportes', icon: FileText },
  { to: '/reporte-diario', label: 'Reporte Diario', icon: ClipboardList },
  { to: '/config', label: 'Configuración', icon: Settings }
]

export default function App() {
  const { theme, toggle } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const connect = useDrivesStore(s => s.connect)
  const disconnect = useDrivesStore(s => s.disconnect)
  const loadConfig = useConfigStore(s => s.load)
  const configLoaded = useConfigStore(s => s.config)

  useEffect(() => {
    connect()
    if (!configLoaded) loadConfig()
    return () => disconnect()
  }, [])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Fixed header */}
      <header className="h-20 border-b px-4 flex items-center gap-4 bg-card shrink-0 z-20">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen((v) => !v)} title="Mostrar/Ocultar menú">
          <Menu className="h-5 w-5" />
        </Button>
        <img src="/agriplus.png" alt="agriplus" className="h-12 w-auto" />
        <h1 className="text-2xl font-bold tracking-tight">Monitoreo de Drives</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar (collapsible) */}
        <aside
          className={cn(
            'border-r bg-card flex flex-col transition-all duration-200 overflow-hidden',
            sidebarOpen ? 'w-60' : 'w-0'
          )}
        >
          <nav className="flex-1 p-3 space-y-1 min-w-[15rem]">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 p-6 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/historicos" element={<Historicos />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/reporte-diario" element={<ReporteDiario />} />
              <Route path="/config" element={<Config />} />
            </Routes>
          </main>
          <footer className="h-8 border-t px-6 flex items-center justify-center text-xs text-muted-foreground bg-card shrink-0">
            Powered By <strong className="ml-1">Tecno Electric S.A.</strong>
          </footer>
        </div>
      </div>
    </div>
  )
}
