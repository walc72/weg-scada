import { useState, useEffect } from 'react'
import { authFetch } from '../../store/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { SkeletonTabla } from '../../components/ui/skeleton'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { SeccionConfig, Campo, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import { API_BASE, MODE } from './comun'

// ─── SMTP / Correo ────────────────────────────────────────────────────
type SmtpCfg = { host: string; port: number; user: string; from: string; to: string; secure: boolean; hasPassword: boolean; pass: string }

export default function CorreoTab() {
  const [cfg, setCfg] = useState<SmtpCfg | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      if (MODE === 'mock') {
        setCfg({ host: 'smtp.gmail.com', port: 587, user: 'planta@agriplus.com', from: 'planta@agriplus.com', to: 'mantenimiento@agriplus.com', secure: false, hasPassword: true, pass: '' })
      } else {
        const r = await authFetch(`${API_BASE}/settings/smtp`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json()
        setCfg({ ...d, pass: '' })
      }
    } catch (e: any) { toast.error(`No se pudo cargar el SMTP: ${e.message}`) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  if (loading || !cfg) return <SkeletonTabla />

  return (
    <div className="max-w-3xl space-y-4">
      <SmtpSection cfg={cfg} onGuardado={setCfg} />
      <DailyReportSection />
    </div>
  )
}

function SmtpSection({ cfg, onGuardado }: { cfg: SmtpCfg; onGuardado: (c: SmtpCfg) => void }) {
  const ed = useEdicion(cfg)
  const v = ed.valor
  const [guardando, correr] = useGuardando()
  const [testing, setTesting] = useState(false)
  const patch = (p: Partial<SmtpCfg>) => ed.set(c => ({ ...c, ...p }))

  async function enviar(c: SmtpCfg) {
    if (MODE === 'mock') { toast.success('Guardado (demo)'); return true }
    const body: any = { host: c.host, port: c.port, user: c.user, from: c.from, to: c.to, secure: c.secure }
    if (c.pass) body.pass = c.pass
    try {
      const r = await authFetch(`${API_BASE}/settings/smtp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      toast.success('SMTP guardado')
      return true
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`); return false }
  }

  // La contraseña no vuelve del server: al guardar se limpia el campo y queda «configurada»
  const guardar = () => correr(async () => {
    const enviado = v
    if (await ed.guardar(enviar)) onGuardado({ ...enviado, pass: '', hasPassword: enviado.hasPassword || !!enviado.pass })
  })

  async function test() {
    if (MODE === 'mock') { toast.success('Correo de prueba enviado (demo)'); return }
    setTesting(true)
    try {
      const r = await authFetch(`${API_BASE}/settings/smtp/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      toast.success(`Correo de prueba enviado a ${d.to}`)
    } catch (e: any) { toast.error(`Falló el envío de prueba: ${e.message}`) }
    finally { setTesting(false) }
  }

  return (
    <SeccionConfig titulo="CORREO SMTP" ayuda="Servidor de correo saliente usado para alertas y el reporte diario."
      acciones={
        <Button size="sm" variant="outline" disabled={testing || ed.sucio} onClick={test}
          title={ed.sucio ? 'Guardá los cambios antes de probar' : undefined}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}ENVIAR PRUEBA
        </Button>
      }>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2"><Campo etiqueta="Servidor (host)"><Input value={v.host} onChange={e => patch({ host: e.target.value })} placeholder="smtp.gmail.com" className="font-mono" /></Campo></div>
        <Campo etiqueta="Puerto"><Input type="number" value={v.port} onChange={e => patch({ port: +e.target.value })} className="font-mono" /></Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo etiqueta="Usuario"><Input value={v.user} onChange={e => patch({ user: e.target.value })} autoComplete="off" placeholder="usuario@dominio.com" /></Campo>
        <Campo etiqueta="Contraseña"><Input type="password" value={v.pass} onChange={e => patch({ pass: e.target.value })} placeholder={v.hasPassword ? '•••••• (sin cambios)' : 'contraseña'} autoComplete="new-password" /></Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo etiqueta="Remitente (From)"><Input value={v.from} onChange={e => patch({ from: e.target.value })} placeholder="planta@dominio.com" /></Campo>
        <Campo etiqueta="Destinatario(s)"><Input value={v.to} onChange={e => patch({ to: e.target.value })} placeholder="uno@dominio.com, otro@..." /></Campo>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Switch id="smtp-secure" checked={v.secure} onCheckedChange={s => patch({ secure: s })} />
          <Label htmlFor="smtp-secure">Conexión segura (SSL/TLS)</Label>
        </div>
        <p className="text-xs text-muted-foreground">SSL/TLS directo, puerto 465. Para 587 dejar apagado (STARTTLS).</p>
      </div>
      <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
    </SeccionConfig>
  )
}

// ─── Reporte diario: hora de envío ────────────────────────────────────
type DailyReportCfg = { time: string; fromEnv: boolean; enabled: boolean; nextRunAt: string | null }

function DailyReportSection() {
  const [info, setInfo] = useState<DailyReportCfg | null>(null)

  useEffect(() => {
    if (MODE === 'mock') { setInfo({ time: '06:00', fromEnv: true, enabled: true, nextRunAt: null }); return }
    authFetch(`${API_BASE}/settings/daily-report`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: DailyReportCfg) => setInfo(d))
      .catch((e: any) => toast.error(`No se pudo leer la hora del reporte: ${e.message}`))
  }, [])

  if (!info) return null
  return <DailyReportForm info={info} onGuardado={setInfo} />
}

function DailyReportForm({ info, onGuardado }: { info: DailyReportCfg; onGuardado: (d: DailyReportCfg) => void }) {
  const ed = useEdicion(info.time)
  const [guardando, correr] = useGuardando()
  const next = info.nextRunAt ? new Date(info.nextRunAt) : null

  async function enviar(time: string) {
    if (!/^\d{2}:\d{2}$/.test(time)) { toast.error('Hora inválida'); return false }
    if (MODE === 'mock') { toast.success('Guardado (demo)'); onGuardado({ ...info, time, fromEnv: false }); return true }
    try {
      const r = await authFetch(`${API_BASE}/settings/daily-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      onGuardado(d)
      toast.success(`El reporte diario sale a las ${d.time}`)
      return true
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`); return false }
  }

  return (
    <SeccionConfig titulo="REPORTE DIARIO"
      ayuda="A esta hora se genera el PDF del día anterior y se envía a los destinatarios del correo. También es el cierre del día para cargar lluvia y altura del río.">
      {!info.enabled ? (
        <p className="text-sm text-(--p3-text)">El envío automático está deshabilitado en el servidor (DAILY_REPORT_ENABLED=false).</p>
      ) : (
        <>
          <div className="flex items-end gap-3 flex-wrap">
            <Campo etiqueta="Hora de envío" htmlFor="reporte-hora">
              <Input id="reporte-hora" type="time" value={ed.valor} onChange={e => ed.set(e.target.value)} className="w-32 font-mono" />
            </Campo>
            {next && (
              <span className="text-xs text-muted-foreground pb-2">
                Próximo envío: {next.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={() => correr(() => ed.guardar(enviar))} />
        </>
      )}
    </SeccionConfig>
  )
}
