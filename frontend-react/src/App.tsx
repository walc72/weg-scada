import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, LineChart, Settings, Sun, Moon, Zap } from 'lucide-react'
import { useTheme } from './lib/theme'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { cn } from './lib/utils'
import Dashboard from './views/Dashboard'
import Historicos from './views/Historicos'
import Config from './views/Config'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/historicos', label: 'Históricos', icon: LineChart },
  { to: '/config', label: 'Configuración', icon: Settings }
]

export default function App() {
  const { theme, toggle } = useTheme()
  const loc = useLocation()
  const current = navItems.find((n) => n.to === loc.pathname)?.label ?? 'WEG SCADA'

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="h-14 border-b px-5 flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">agriplus</span>
          <Badge variant="outline" className="ml-auto text-[10px]">v3</Badge>
        </div>
        <nav className="flex-1 p-3 space-y-1">
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
        <div className="p-3 border-t text-xs text-muted-foreground">
          Monitoreo de Drives WEG
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b px-6 flex items-center gap-3 bg-card">
          <h1 className="text-lg font-semibold">{current}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/historicos" element={<Historicos />} />
            <Route path="/config" element={<Config />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
