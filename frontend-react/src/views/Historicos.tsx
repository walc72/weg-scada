import { useState, useEffect } from 'react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ServerOff, RefreshCw, ExternalLink, LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'

const GRAFANA_HOST = (import.meta.env.VITE_GRAFANA_HOST as string) || `${window.location.protocol}//${window.location.hostname}:3000`
const DASHBOARD_UID = (import.meta.env.VITE_GRAFANA_DASHBOARD_UID as string) || '09a1e458-a873-4fe2-a183-13fd204b2c02'

const RANGES = ['1h', '6h', '24h', '7d', '30d'] as const

export default function Historicos() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('6h')
  const [iframeKey, setIframeKey] = useState(0)
  const [reachable, setReachable] = useState(false)

  useEffect(() => {
    const isMock = !import.meta.env.VITE_DATA_MODE || import.meta.env.VITE_DATA_MODE === 'mock'
    if (isMock) {
      setReachable(false)
      return
    }
    fetch(`${GRAFANA_HOST}/api/health`, { mode: 'no-cors', cache: 'no-store' })
      .then(() => setReachable(true))
      .catch(() => setReachable(false))
  }, [])

  const iframeUrl = `${GRAFANA_HOST}/d/${DASHBOARD_UID}?orgId=1&from=now-${range}&to=now&kiosk=tv&theme=light&refresh=10s`
  const externalUrl = `${GRAFANA_HOST}/d/${DASHBOARD_UID}?orgId=1&from=now-${range}&to=now`

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
        <LineChart className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Históricos</h2>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border bg-background p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded transition-colors',
                  range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIframeKey((k) => k + 1)} title="Recargar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" asChild title="Abrir en Grafana">
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {reachable ? (
        <iframe key={iframeKey} src={iframeUrl} className="w-full block border-0" style={{ height: 'calc(100vh - 200px)', minHeight: 600 }} />
      ) : (
        <div className="text-center p-12">
          <ServerOff className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-muted-foreground font-semibold">Grafana no disponible</h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">
            En modo desarrollo (mock) Grafana no está corriendo.<br />
            En producción esta vista embebe el dashboard de Grafana en <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{GRAFANA_HOST}</code>
          </p>
        </div>
      )}
    </Card>
  )
}
