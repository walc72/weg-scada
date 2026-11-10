import { useEffect, useState } from 'react'
import { apiJson } from '../../lib/api'
import { copyText } from '../../lib/utils'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { Textarea } from '../../components/ui/textarea'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Plus, Copy, Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SeccionConfig, Campo } from '../../components/config'
import { MODE } from './comun'
import { PedidoDialog, type Pedido } from './filas'

type Replica = { id: string; name: string; status: string; createdAt: string | null; lastSeenAt: string | null; lastIp: string | null; legacy?: boolean }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

export default function ReplicasTab() {
  const [rows, setRows] = useState<Replica[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [plantUrl, setPlantUrl] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [pedido, setPedido] = useState<Pedido | null>(null)

  async function load() { try { setRows((await apiJson<{ replicas: Replica[] }>('/replicas')).replicas) } catch (e: any) { toast.error(e.message) } }
  useEffect(() => { if (MODE !== 'mock') load() }, [])

  async function openNew() {
    setName(''); setCode(''); setOpen(true)
    const port = window.location.port ? `:${window.location.port}` : ''
    const initial = `${window.location.protocol}//${window.location.hostname}${port}`
    setPlantUrl(initial)
    try {
      const ts = await apiJson<{ state: string; ip: string | null }>('/system/tailscale')
      // Solo si el usuario no la editó mientras se consultaba Tailscale
      if (ts.state === 'Running' && ts.ip) setPlantUrl(cur => (cur === initial ? `http://${ts.ip}${port || ':80'}` : cur))
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

  const pedirRevocar = (r: Replica) => setPedido({
    titulo: `¿Revocar ${r.name}?`, textoConfirmar: 'REVOCAR', peligro: true,
    mensaje: 'Deja de poder bajar el histórico y la configuración de la planta al instante. Ojo: los datos en vivo (MQTT) no requieren token y los sigue viendo mientras llegue a la planta por la red.',
    accion: async () => {
      try { await apiJson(`/replicas/${r.id}`, { method: 'DELETE' }); toast.success('Réplica revocada'); load() }
      catch (e: any) { toast.error(e.message) }
    },
  })

  if (MODE === 'mock') return <div className="text-sm text-muted-foreground py-8 text-center">No disponible en modo demo.</div>

  return (
    <div className="space-y-2">
      <SeccionConfig titulo="RÉPLICAS" ayuda="Servidores de solo lectura que copian los datos de esta planta."
        acciones={<Button size="sm" onClick={openNew}><Plus className="h-4 w-4" />AGREGAR RÉPLICA</Button>}>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay réplicas.</p> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nombre</TableHead><TableHead>Última conexión</TableHead><TableHead>Desde</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmt(r.lastSeenAt)}</TableCell>
                  <TableCell className="font-mono">{r.lastIp || '—'}</TableCell>
                  <TableCell><Badge variant={r.status === 'revocada' ? 'outline' : 'secondary'}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {!r.legacy && r.status !== 'revocada' && (
                      <Button size="sm" variant="destructive" onClick={() => pedirRevocar(r)}><Ban className="h-4 w-4" />REVOCAR</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SeccionConfig>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar réplica</DialogTitle></DialogHeader>
          {!code ? (
            <div className="space-y-3">
              <Campo etiqueta="Nombre" htmlFor="replica-nombre"><Input id="replica-nombre" value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Oficina Tecno" /></Campo>
              <Campo etiqueta="Dirección con la que la réplica llega a esta planta" htmlFor="replica-url"><Input id="replica-url" value={plantUrl} onChange={e => setPlantUrl(e.target.value)} className="font-mono" /></Campo>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">Pegá este código en la réplica (Configuración → Conexión). <strong>Se muestra una sola vez.</strong></p>
              <Textarea readOnly value={code} rows={4} aria-label="Código de enlace" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{code ? 'CERRAR' : 'CANCELAR'}</Button>
            {!code
              ? <Button disabled={busy || !name.trim() || !plantUrl.trim()} onClick={create}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}GENERAR CÓDIGO</Button>
              : <Button onClick={() => { copyText(code).then(() => toast.success('Código copiado'), () => toast.error('No se pudo copiar: seleccioná el código y copialo a mano')) }}><Copy className="h-4 w-4" />COPIAR CÓDIGO</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PedidoDialog pedido={pedido} onCerrar={() => setPedido(null)} correr={async fn => { await fn() }} />
    </div>
  )
}
