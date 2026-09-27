import { useEffect, useState } from 'react'
import { apiJson } from '../lib/api'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Plus, Copy, Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

type Replica = { id: string; name: string; status: string; createdAt: string | null; lastSeenAt: string | null; lastIp: string | null; legacy?: boolean }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

export default function ReplicasTab() {
  const [rows, setRows] = useState<Replica[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [plantUrl, setPlantUrl] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() { try { setRows((await apiJson<{ replicas: Replica[] }>('/replicas')).replicas) } catch (e: any) { toast.error(e.message) } }
  useEffect(() => { if (MODE !== 'mock') load() }, [])

  async function openNew() {
    setName(''); setCode(''); setOpen(true)
    const port = window.location.port ? `:${window.location.port}` : ''
    setPlantUrl(`${window.location.protocol}//${window.location.hostname}${port}`)
    try {
      const ts = await apiJson<{ state: string; ip: string | null }>('/system/tailscale')
      if (ts.state === 'Running' && ts.ip) setPlantUrl(`http://${ts.ip}${port || ':80'}`)
    } catch { /* sin agente: queda la dirección actual */ }
  }

  async function create() {
    setBusy(true)
    try {
      const r = await apiJson<{ code: string }>('/replicas', { method: 'POST', body: JSON.stringify({ name, plantUrl }) })
      setCode(r.code); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  async function revoke(r: Replica) {
    if (!confirm(`¿Revocar "${r.name}"? Deja de poder leer datos de la planta al instante.`)) return
    try { await apiJson(`/replicas/${r.id}`, { method: 'DELETE' }); toast.success('Réplica revocada'); load() }
    catch (e: any) { toast.error(e.message) }
  }

  if (MODE === 'mock') return <div className="text-sm text-muted-foreground py-8 text-center">No disponible en modo demo.</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Servidores de solo lectura que copian los datos de esta planta.</p>
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" />Nueva réplica</Button>
      </div>
      {rows.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">No hay réplicas.</Card>}
      {rows.map(r => (
        <Card key={r.id} className="p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">Última conexión: {fmt(r.lastSeenAt)}{r.lastIp ? ` · desde ${r.lastIp}` : ''}</div>
          </div>
          <Badge variant={r.status === 'revocada' ? 'outline' : 'secondary'} className="ml-auto">{r.status}</Badge>
          {!r.legacy && r.status !== 'revocada' && (
            <Button size="sm" variant="outline" onClick={() => revoke(r)}><Ban className="h-3.5 w-3.5 mr-1" />Revocar</Button>
          )}
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva réplica</DialogTitle></DialogHeader>
          {!code ? (
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Oficina Tecno" /></div>
              <div><Label>Dirección con la que la réplica llega a esta planta</Label><Input value={plantUrl} onChange={e => setPlantUrl(e.target.value)} className="font-mono" /></div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">Pegá este código en la réplica (Configuración → Conexión). <strong>Se muestra una sola vez.</strong></p>
              <textarea readOnly value={code} rows={4} className="w-full rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono" />
            </div>
          )}
          <DialogFooter>
            {!code
              ? <Button size="sm" disabled={busy || !name.trim() || !plantUrl.trim()} onClick={create}>{busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}Generar código</Button>
              : <Button size="sm" onClick={() => { navigator.clipboard.writeText(code).then(() => toast.success('Código copiado'), () => toast.error('No se pudo copiar')) }}><Copy className="h-3.5 w-3.5 mr-1" />Copiar código</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
