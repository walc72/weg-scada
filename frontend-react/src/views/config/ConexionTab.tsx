import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { apiJson } from '../../lib/api'
import { useServerStore } from '../../store/server'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { Textarea } from '../../components/ui/textarea'
import { ConfirmarDialog } from '../../components/ui/confirmar-dialog'
import { Loader2, Link2, Unlink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { SeccionConfig, Campo } from '../../components/config'
import { MODE } from './comun'
import { PedidoDialog, type Pedido } from './filas'

type TsStatus = { state: string; tailnet: string | null; user: string | null; ip: string | null; hostname: string | null; authUrl: string | null }

const TS_LABEL: Record<string, { text: string; cls: string }> = {
  Running: { text: 'Conectado', cls: 'border text-foreground' },
  NeedsLogin: { text: 'Esperando login', cls: 'border border-(--p3) text-(--p3-text)' },
  // El tailnet exige que un administrador apruebe el equipo en la consola de Tailscale
  NeedsMachineAuth: { text: 'Esperando aprobación del administrador de Tailscale', cls: 'border border-(--p3) text-(--p3-text)' },
  Stopped: { text: 'Detenido', cls: 'bg-muted text-muted-foreground' },
  NoState: { text: 'Iniciando', cls: 'bg-muted text-muted-foreground' },
  Unavailable: { text: 'No disponible', cls: 'bg-muted text-muted-foreground' },
}

function TailscaleCard({ replica }: { replica: boolean }) {
  const [st, setSt] = useState<TsStatus | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [hostname, setHostname] = useState('')
  const [qr, setQr] = useState('')
  const [paso, setPaso] = useState<0 | 1 | 2>(0) // desconectar: doble confirmación

  async function load() {
    try { const s = await apiJson<TsStatus>('/system/tailscale'); setSt(s); setErr('') }
    catch (e: any) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (st?.hostname && !hostname) setHostname(st.hostname) }, [st?.hostname])

  // Login pendiente: refrescar cada 3 s hasta que quede conectado
  const pending = !!st && st.state !== 'Running' && !!st.authUrl
  useEffect(() => {
    if (!pending) return
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [pending])

  useEffect(() => {
    if (!st?.authUrl) { setQr(''); return }
    QRCode.toDataURL(st.authUrl, { width: 180, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [st?.authUrl])

  async function connect() {
    setBusy(true)
    try {
      const h = (hostname || st?.hostname || (replica ? 'weg-replica' : 'weg-planta')).trim().toLowerCase()
      setSt(await apiJson<TsStatus>('/system/tailscale/login', { method: 'POST', body: JSON.stringify({ hostname: h }) }))
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  async function disconnect() {
    setBusy(true)
    try { setSt(await apiJson<TsStatus>('/system/tailscale/logout', { method: 'POST' })); toast.success('Desconectado de Tailscale') }
    catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  const label = TS_LABEL[st?.state || ''] || { text: st?.state || '…', cls: 'bg-muted text-muted-foreground' }

  return (
    <SeccionConfig titulo="CONEXIÓN" ayuda="Acceso remoto a este servidor por Tailscale."
      acciones={<span className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${label.cls}`}>{label.text}</span>}>
      {err && <div className="text-sm text-destructive">{err}</div>}
      {st?.state === 'Running' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Tailnet: </span><strong className="font-mono">{st.tailnet || '—'}</strong></div>
          <div><span className="text-muted-foreground">IP: </span><span className="font-mono">{st.ip || '—'}</span></div>
          <div><span className="text-muted-foreground">Nombre: </span>{st.hostname || '—'}</div>
          <div><span className="text-muted-foreground">Cuenta: </span>{st.user || '—'}</div>
        </div>
      )}
      {st && st.state !== 'Running' && st.state !== 'Unavailable' && (
        <div className="space-y-3">
          {!st.authUrl && (
            <div className="flex items-end gap-2">
              <div className="flex-1"><Campo etiqueta="Nombre del equipo en Tailscale" htmlFor="ts-hostname"><Input id="ts-hostname" value={hostname} onChange={e => setHostname(e.target.value)} placeholder={replica ? 'weg-replica' : 'weg-planta'} className="font-mono" /></Campo></div>
              <Button size="sm" disabled={busy} onClick={connect}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}CONECTAR</Button>
            </div>
          )}
          {st.authUrl && (
            <div className="flex flex-wrap items-center gap-4">
              {qr && <img src={qr} alt="QR de login de Tailscale" className="rounded-sm border bg-white p-1" />}
              <div className="space-y-2 text-sm min-w-0">
                <p>Abrí el link (o escaneá el QR) e iniciá sesión con la cuenta del tailnet correcto.</p>
                <a href={st.authUrl} target="_blank" rel="noreferrer" className="break-all text-primary underline">{st.authUrl}</a>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Esperando la aprobación…</p>
              </div>
            </div>
          )}
        </div>
      )}
      {st?.state === 'Unavailable' && <p className="text-sm text-muted-foreground">Tailscale no está instalado en este servidor.</p>}
      {st?.state === 'Running' && (
        <div className="flex justify-end"><Button size="sm" variant="destructive" disabled={busy} onClick={() => setPaso(1)}><Unlink className="h-4 w-4" />DESCONECTAR</Button></div>
      )}
      <ConfirmarDialog open={paso > 0} peligro
        titulo={paso === 1 ? '¿Desconectar este servidor de Tailscale?' : 'Confirmá de nuevo'}
        mensaje={paso === 1
          ? `Se corta el acceso remoto por Tailscale.${replica ? '' : ' Esto corta las réplicas y el acceso remoto a la planta.'}`
          : 'Se desconecta de Tailscale.'}
        textoConfirmar={paso === 1 ? 'CONTINUAR' : 'DESCONECTAR'}
        onConfirmar={() => { if (paso === 1) setPaso(2); else { setPaso(0); void disconnect() } }}
        onCancelar={() => setPaso(0)} />
    </SeccionConfig>
  )
}

type LinkInfo = { configured: boolean; fromEnv?: boolean; source?: string; name?: string; pairedAt?: string | null; tokenMasked?: string | null }
type SyncStatus = { configured: boolean; source: string | null; lastSync: number | null; lagSec: number | null; live: boolean; error: string | null }
type TestResult = { ok: boolean; error?: string; name?: string; source?: string; oldest?: string | null; newest?: string | null }

function fmtLag(s: number | null) {
  if (s == null) return '—'
  if (s < 120) return `${s} s`
  if (s < 7200) return `${Math.round(s / 60)} min`
  if (s < 172800) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} días`
}

function PlantLinkCard() {
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [code, setCode] = useState('')
  const [test, setTest] = useState<TestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const mounted = useRef(true)

  async function loadLink() { try { setLink(await apiJson<LinkInfo>('/replica-link')) } catch (e: any) { toast.error(e.message) } }
  async function loadSync() { try { const s = await apiJson<SyncStatus>('/replica-link/status'); if (mounted.current) setSync(s) } catch { if (mounted.current) setSync(null) } }
  useEffect(() => {
    mounted.current = true
    loadLink(); loadSync()
    const id = setInterval(loadSync, 5000)
    return () => { mounted.current = false; clearInterval(id) }
  }, [])

  async function doTest() {
    setBusy(true)
    try { setTest(await apiJson<TestResult>('/replica-link/test', { method: 'POST', body: JSON.stringify({ code }) })) }
    catch (e: any) { setTest({ ok: false, error: e.message }) }
    finally { setBusy(false) }
  }

  function pedirGuardar() {
    if (!(link?.configured && test?.source && link.source !== test.source)) { void save(); return }
    setPedido({
      titulo: '¿Conectar con otra planta?', textoConfirmar: 'CONECTAR', peligro: true, accion: save,
      mensaje: `Este código es de otra planta (${test.source}). El histórico nuevo se va a mezclar con el anterior.`,
    })
  }

  async function save() {
    setBusy(true)
    try {
      await apiJson('/replica-link', { method: 'PUT', body: JSON.stringify({ code }) })
      toast.success('Conectado a planta. La sincronización arranca en unos segundos.')
      setCode(''); setTest(null); loadLink()
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  const pedirDesvincular = () => setPedido({
    titulo: '¿Desvincular de planta?', textoConfirmar: 'DESVINCULAR', peligro: true, accion: unlink,
    mensaje: 'Se corta la sincronización; el histórico copiado queda.',
  })

  async function unlink() {
    try { await apiJson('/replica-link', { method: 'DELETE' }); toast.success('Desvinculado'); loadLink() }
    catch (e: any) { toast.error(e.message) }
  }

  const ago = sync?.lastSync ? Math.max(0, Math.round((Date.now() - sync.lastSync) / 1000)) : null

  return (
    <SeccionConfig titulo="ENLACE CON PLANTA" acciones={link?.configured
      ? <Badge variant="secondary">{link.fromEnv ? 'Enlazada por .env' : `Enlazada: ${link.name}`}</Badge>
      : <Badge variant="outline">Sin enlazar</Badge>}>
      {link?.configured && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Dirección: </span><span className="font-mono">{link.source}</span></div>
          <div><span className="text-muted-foreground">Token: </span><span className="font-mono">{link.tokenMasked}</span></div>
          <div><span className="text-muted-foreground">En vivo: </span>{sync?.live ? 'conectado' : 'desconectado'}</div>
          <div><span className="text-muted-foreground">Última sync: </span>{ago == null ? '—' : `hace ${fmtLag(ago)}`}</div>
          <div><span className="text-muted-foreground">Atraso: </span>{fmtLag(sync?.lagSec ?? null)}</div>
          {sync?.error && <div className="sm:col-span-2 text-destructive">Último error: {sync.error}</div>}
        </div>
      )}
      <div className="space-y-2">
        <Campo etiqueta={link?.configured ? 'Cambiar código de enlace' : 'Código de enlace'} htmlFor="codigo-enlace"
          ayuda={link?.configured ? undefined : 'Se genera en la planta, en Configuración → Réplicas.'}>
          <Textarea id="codigo-enlace" value={code} onChange={e => { setCode(e.target.value); setTest(null) }} rows={3} placeholder="WEGR1-…" />
        </Campo>
        {test && (test.ok
          ? <div className="text-sm text-foreground">OK: {test.name} · {test.source} · histórico desde {test.oldest ? new Date(test.oldest).toLocaleDateString() : '—'}</div>
          : <div className="text-sm text-destructive">{test.error}</div>)}
        <div className="flex justify-between">
          {link?.configured && !link.fromEnv
            ? <Button size="sm" variant="destructive" onClick={pedirDesvincular}><Unlink className="h-4 w-4" />DESVINCULAR</Button>
            : <span />}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy || !code.trim()} onClick={doTest}>PROBAR CONEXIÓN</Button>
            <Button size="sm" disabled={busy || !test?.ok} onClick={pedirGuardar}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}GUARDAR Y CONECTAR</Button>
          </div>
        </div>
      </div>
      <PedidoDialog pedido={pedido} onCerrar={() => setPedido(null)} correr={async fn => { await fn() }} />
    </SeccionConfig>
  )
}

export default function ConexionTab() {
  const replica = useServerStore(s => s.replica)
  if (MODE === 'mock') return <div className="text-sm text-muted-foreground py-8 text-center">No disponible en modo demo.</div>
  return (
    <div className="space-y-4 max-w-3xl">

      <TailscaleCard replica={replica} />
      {replica && <PlantLinkCard />}
    </div>
  )
}
