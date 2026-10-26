// Destinos del backup externo: Google Drive (flujo de dispositivo) y SFTP (clave propia + huella).
import { useEffect, useState } from 'react'
import { backupApi } from '../store/backup'
import type { BackupInfo, BackupPrueba } from '../types'
import { copyText } from '../lib/utils'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Switch } from '../components/ui/switch'
import { Copy, Loader2, Save, FlaskConical, Link2, Unlink, KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

const SIN_FRASE = 'Cargá la frase del backup antes de activar un destino'

// Interruptor Activo; deshabilitado con explicación (title en el span: un botón deshabilitado no recibe hover)
function Activo({ checked, motivo, onChange }: { checked: boolean; motivo: string; onChange: (v: boolean) => void }) {
  return (
    <span className="flex items-center gap-2 text-sm" title={motivo}>
      Activo <Switch checked={checked} disabled={!!motivo && !checked} onCheckedChange={onChange} />
    </span>
  )
}

function useProbar(destino: 'drive' | 'sftp') {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<BackupPrueba | null>(null)
  async function probar() {
    setBusy(true); setRes(null)
    try {
      const r = await backupApi<BackupPrueba>(`/${destino}/probar`, 'POST')
      setRes(r)
      if (r.ok) toast.success('Prueba correcta')
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }
  return { busy, res, probar, setRes }
}

async function put(body: unknown, reload: () => void, okMsg: string) {
  try { await backupApi('', 'PUT', body); toast.success(okMsg); reload(); return true }
  catch (e: any) { toast.error(e.message); return false }
}

export default function BackupDestinos({ info, reload }: { info: BackupInfo; reload: () => void }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Destinos</h3>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <DriveCard info={info} reload={reload} />
        <SftpCard info={info} reload={reload} />
      </div>
    </section>
  )
}

type Flujo = { userCode: string; verificationUrl: string } | null

function DriveCard({ info, reload }: { info: BackupInfo; reload: () => void }) {
  const d = info.drive!
  const [flujo, setFlujo] = useState<Flujo>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [busy, setBusy] = useState(false)
  const prueba = useProbar('drive')

  // Esperando aprobación: GET cada 3 s hasta un estado final
  useEffect(() => {
    if (!flujo) return
    const t = setInterval(async () => {
      try {
        const r = await backupApi<{ estado: string; cuenta?: string; error?: string }>('/drive/conectar')
        if (r.estado === 'pendiente') return
        setFlujo(null)
        if (r.estado === 'conectado') toast.success(`Google Drive conectado${r.cuenta ? ` (${r.cuenta})` : ''}`)
        else if (r.estado === 'vencido') toast.error('El código venció; volvé a conectar')
        else if (r.estado === 'rechazado') toast.error('Se rechazó el acceso en Google')
        else toast.error(r.error || 'No se pudo conectar Google Drive')
        reload()
      } catch (e: any) { setFlujo(null); toast.error(e.message) }
    }, 3000)
    return () => clearInterval(t)
  }, [flujo])

  async function conectar() {
    setBusy(true)
    try { setFlujo(await backupApi<Flujo>('/drive/conectar', 'POST')) } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }
  async function desconectar() {
    setBusy(true)
    try { await backupApi('/drive/desconectar', 'POST'); toast.success('Google Drive desconectado'); setConfirmar(false); prueba.setRes(null); reload() }
    catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  if (!d.disponible) {
    return (
      <Card className="p-4 space-y-2 opacity-60">
        <div className="font-medium">Google Drive</div>
        <p className="text-sm text-muted-foreground">Google Drive no está configurado en esta versión</p>
        <Button size="sm" variant="outline" disabled><Link2 className="h-3.5 w-3.5 mr-1" />Conectar</Button>
      </Card>
    )
  }

  const motivo = !info.fraseConfigurada ? SIN_FRASE : !d.conectado ? 'Conectá Google Drive antes de activarlo' : ''
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">Google Drive</span>
        {d.conectado ? <Badge variant="success">Conectado</Badge> : <Badge variant="outline">Sin conectar</Badge>}
        <span className="ml-auto"><Activo checked={d.activo} motivo={motivo} onChange={v => put({ drive: { activo: v } }, reload, v ? 'Drive activado' : 'Drive desactivado')} /></span>
      </div>

      {d.conectado && d.cuenta && <div className="text-sm">Cuenta: <span className="font-mono">{d.cuenta}</span></div>}

      {flujo ? (
        <div className="space-y-2 rounded-md border p-3 text-center">
          <p className="text-sm">Entrá a <a href={flujo.verificationUrl} target="_blank" rel="noreferrer" className="text-primary underline">{flujo.verificationUrl.replace(/^https?:\/\/(www\.)?/, '')}</a> con la cuenta de Google y escribí este código:</p>
          <div className="text-3xl font-mono font-bold tracking-widest select-all">{flujo.userCode}</div>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Esperando aprobación…</p>
          <Button size="sm" variant="ghost" onClick={() => setFlujo(null)}>Cancelar</Button>
        </div>
      ) : !d.conectado ? (
        <Button size="sm" disabled={busy} onClick={conectar}><Link2 className="h-3.5 w-3.5 mr-1" />Conectar</Button>
      ) : confirmar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-2 text-sm">
          <span>¿Desconectar Google Drive? Los backups dejan de subirse ahí.</span>
          <Button size="sm" variant="destructive" disabled={busy} onClick={desconectar}>Desconectar</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={prueba.busy} onClick={prueba.probar}>{prueba.busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}Probar</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmar(true)}><Unlink className="h-3.5 w-3.5 mr-1" />Desconectar</Button>
        </div>
      )}
      {prueba.res && !prueba.res.ok && <p className="text-sm text-destructive">{prueba.res.error || 'La prueba falló'}</p>}
    </Card>
  )
}

function SftpCard({ info, reload }: { info: BackupInfo; reload: () => void }) {
  const s = info.sftp!
  const [f, setF] = useState({ host: s.host, puerto: s.puerto, usuario: s.usuario, carpeta: s.carpeta })
  const [clave, setClave] = useState(s.clavePublica)
  const [busy, setBusy] = useState(false)
  const prueba = useProbar('sftp')
  const sucio = f.host !== s.host || f.puerto !== s.puerto || f.usuario !== s.usuario || f.carpeta !== s.carpeta

  async function guardar() {
    setBusy(true)
    if (await put({ sftp: f }, reload, 'SFTP guardado')) prueba.setRes(null)
    setBusy(false)
  }
  async function generar() {
    try { setClave((await backupApi<{ clavePublica: string }>('/sftp/clave', 'POST')).clavePublica) } catch (e: any) { toast.error(e.message) }
  }
  async function aceptarHuella(huella: string) {
    try { await backupApi('/sftp/huella', 'POST', { huella }); toast.success('Huella aceptada'); reload(); prueba.probar() }
    catch (e: any) { toast.error(e.message) }
  }

  const motivo = !info.fraseConfigurada ? SIN_FRASE : !s.host || !s.usuario ? 'Completá servidor y usuario SFTP antes de activar' : ''
  const r = prueba.res
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">SFTP</span>
        {s.huella && <Badge variant="outline" title={s.huella}><ShieldCheck className="h-3 w-3 mr-1" />Huella aceptada</Badge>}
        <span className="ml-auto"><Activo checked={s.activo} motivo={motivo} onChange={v => put({ sftp: { activo: v } }, reload, v ? 'SFTP activado' : 'SFTP desactivado')} /></span>
      </div>
      <div className="grid gap-3 grid-cols-[1fr_6rem]">
        <div><Label>Servidor</Label><Input value={f.host} onChange={e => setF({ ...f, host: e.target.value.trim() })} placeholder="192.168.10.50" /></div>
        <div><Label>Puerto</Label><Input type="number" min={1} max={65535} value={f.puerto} onChange={e => setF({ ...f, puerto: Math.trunc(+e.target.value) })} /></div>
        <div><Label>Usuario</Label><Input value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value.trim() })} /></div>
        <div className="col-span-2"><Label>Carpeta remota</Label><Input value={f.carpeta} onChange={e => setF({ ...f, carpeta: e.target.value })} placeholder="/srv/backups (vacío = carpeta del usuario)" /></div>
      </div>
      <div className="flex justify-end"><Button size="sm" disabled={busy || !sucio} onClick={guardar}><Save className="h-3.5 w-3.5 mr-1" />Guardar</Button></div>

      <div className="space-y-2 border-t pt-3">
        <div className="text-sm font-medium">Clave pública</div>
        {clave ? (
          <>
            <textarea readOnly value={clave} rows={3} onFocus={e => e.currentTarget.select()} className="w-full rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono break-all" />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copyText(clave).then(() => toast.success('Clave copiada'), () => toast.error('No se pudo copiar: seleccioná la clave y copiala a mano'))}><Copy className="h-3.5 w-3.5 mr-1" />Copiar</Button>
              <span className="text-xs text-muted-foreground">Agregá esta línea al archivo ~/.ssh/authorized_keys del usuario en el equipo destino</span>
            </div>
          </>
        ) : <Button size="sm" variant="outline" onClick={generar}><KeyRound className="h-3.5 w-3.5 mr-1" />Generar</Button>}
      </div>

      <div className="space-y-2 border-t pt-3">
        <Button size="sm" variant="outline" disabled={prueba.busy || sucio || !s.host || !s.usuario} title={sucio ? 'Guardá los cambios antes de probar' : undefined} onClick={prueba.probar}>
          {prueba.busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}Probar
        </Button>
        {r && !r.ok && r.huella && (
          <div className="rounded-md border p-2 text-sm space-y-2">
            <div>Huella del equipo: <span className="font-mono break-all">{r.huella}</span></div>
            <p className="text-xs text-muted-foreground">Verificala con el administrador del equipo destino antes de aceptarla.</p>
            <Button size="sm" onClick={() => aceptarHuella(r.huella!)}><ShieldCheck className="h-3.5 w-3.5 mr-1" />Aceptar huella</Button>
          </div>
        )}
        {r && !r.ok && !r.huella && <p className="text-sm text-destructive">{r.error || 'La prueba falló'}</p>}
      </div>
    </Card>
  )
}
