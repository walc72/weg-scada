import { useState, useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, LineChart, Settings, Sun, Moon, Menu, Timer, FileText } from 'lucide-react'
import { useTheme } from './lib/theme'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { cn } from './lib/utils'
import { useDrivesStore } from './store/drives'
import Dashboard from './views/Dashboard'
import Historicos from './views/Historicos'
import Reportes from './views/Reportes'
import Config from './views/Config'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/historicos', label: 'Históricos', icon: LineChart },
  { to: '/reportes', label: 'Reportes', icon: FileText },
  { to: '/config', label: 'Configuración', icon: Settings }
]

const REFRESH_OPTIONS = [
  { label: '1s',  ms: 1000 },
  { label: '2s',  ms: 2000 },
  { label: '5s',  ms: 5000 },
  { label: '10s', ms: 10000 },
  { label: '30s', ms: 30000 },
]

export default function App() {
  const { theme, toggle } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showRefresh, setShowRefresh] = useState(false)
  const refreshMs = useDrivesStore(s => s.refreshMs)
  const setRefreshMs = useDrivesStore(s => s.setRefreshMs)
  const connect = useDrivesStore(s => s.connect)
  const disconnect = useDrivesStore(s => s.disconnect)
  const currentLabel = REFRESH_OPTIONS.find(o => o.ms === refreshMs)?.label ?? `${refreshMs / 1000}s`

  useEffect(() => {
    connect()
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
          <Badge variant="outline" className="text-[10px]">v3</Badge>

          {/* Refresh interval selector */}
          <div className="relative">
            <button
              onClick={() => setShowRefresh(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
                showRefresh
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground hover:text-foreground border-input'
              )}
              title="Intervalo de refresco"
            >
              <Timer className="h-3.5 w-3.5" />
              {currentLabel}
            </button>
            {showRefresh && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-md min-w-[80px]">
                {REFRESH_OPTIONS.map(opt => (
                  <button
                    key={opt.ms}
                    onClick={() => { setRefreshMs(opt.ms); setShowRefresh(false) }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground',
                      refreshMs === opt.ms ? 'font-semibold text-primary' : 'text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

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
