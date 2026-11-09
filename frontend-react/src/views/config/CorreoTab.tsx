import { useState, useEffect } from 'react'
import { authFetch } from '../../store/auth'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { SkeletonTabla } from '../../components/ui/skeleton'
import { Loader2, Mail, Save } from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE, MODE } from './comun'

// ─── SMTP / Correo ────────────────────────────────────────────────────
type SmtpCfg = { host: string; port: number; user: string; from: string; to: string; secure: boolean; hasPassword: boolean; pass: string }

export default function CorreoTab() {
  const [cfg, setCfg] = useState<SmtpCfg | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

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

  function patch(p: Partial<SmtpCfg>) { setCfg(c => c ? { ...c, ...p } : c) }

  async function save() {
    if (!cfg) return
    if (MODE === 'mock') { toast.success('Guardado (demo)'); patch({ pass: '', hasPassword: cfg.hasPassword || !!cfg.pass }); return }
    setSaving(true)
    try {
      const body: any = { host: cfg.host, port: cfg.port, user: cfg.user, from: cfg.from, to: cfg.to, secure: cfg.secure }
      if (cfg.pass) body.pass = cfg.pass
      const r = await authFetch(`${API_BASE}/settings/smtp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`)
      toast.success('SMTP guardado')
      patch({ pass: '', hasPassword: cfg.hasPassword || !!cfg.pass })
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

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

  if (loading || !cfg) return <SkeletonTabla />

  return (
    <div className="max-w-2xl">
      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">Servidor de correo saliente usado para alertas y el reporte diario.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2"><Label>Servidor (host)</Label><Input value={cfg.host} onChange={e => patch({ host: e.target.value })} placeholder="smtp.gmail.com" /></div>
          <div><Label>Puerto</Label><Input type="number" value={cfg.port} onChange={e => patch({ port: +e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Usuario</Label><Input value={cfg.user} onChange={e => patch({ user: e.target.value })} autoComplete="off" placeholder="usuario@dominio.com" /></div>
          <div><Label>Contraseña</Label><Input type="password" value={cfg.pass} onChange={e => patch({ pass: e.target.value })} placeholder={cfg.hasPassword ? '•••••• (sin cambios)' : 'contraseña'} autoComplete="new-password" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Remitente (From)</Label><Input value={cfg.from} onChange={e => patch({ from: e.target.value })} placeholder="planta@dominio.com" /></div>
          <div><Label>Destinatario(s)</Label><Input value={cfg.to} onChange={e => patch({ to: e.target.value })} placeholder="uno@dominio.com, otro@..." /></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={cfg.secure} onCheckedChange={v => patch({ secure: v })} />
          Conexión segura (SSL/TLS directo, puerto 465). Para 587 dejar apagado (STARTTLS).
        </label>
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="outline" disabled={testing} onClick={test}>
            {testing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
            Enviar prueba
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </Card>
      <DailyReportCard />
    </div>
  )
}

// ─── Reporte diario: hora de envío ────────────────────────────────────
type DailyReportCfg = { time: string; fromEnv: boolean; enabled: boolean; nextRunAt: string | null }

function DailyReportCard() {
  const [info, setInfo] = useState<DailyReportCfg | null>(null)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (MODE === 'mock') { const d = { time: '06:00', fromEnv: true, enabled: true, nextRunAt: null }; setInfo(d); setTime(d.time); return }
    authFetch(`${API_BASE}/settings/daily-report`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: DailyReportCfg) => { setInfo(d); setTime(d.time) })
      .catch((e: any) => toast.error(`No se pudo leer la hora del reporte: ${e.message}`))
  }, [])

  async function save() {
    if (!/^\d{2}:\d{2}$/.test(time)) { toast.error('Hora inválida'); return }
    if (MODE === 'mock') { toast.success('Guardado (demo)'); setInfo(i => i && { ...i, time, fromEnv: false }); return }
    setSaving(true)
    try {
      const r = await authFetch(`${API_BASE}/settings/daily-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setInfo(d); setTime(d.time)
      toast.success(`El reporte diario sale a las ${d.time}`)
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

  if (!info) return null
  const next = info.nextRunAt ? new Date(info.nextRunAt) : null

  return (
    <Card className="p-4 space-y-3 mt-4">
      <div>
        <div className="font-semibold text-sm">Reporte diario automático</div>
        <p className="text-sm text-muted-foreground">
          A esta hora se genera el PDF del día anterior y se envía a los destinatarios de arriba.
          También es el cierre del día para cargar lluvia y altura del río.
        </p>
      </div>
      {!info.enabled ? (
        <p className="text-sm text-(--p3-text)">El envío automático está deshabilitado en el servidor (DAILY_REPORT_ENABLED=false).</p>
      ) : (
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label>Hora de envío</Label>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-32" />
          </div>
          <Button size="sm" disabled={saving || time === info.time} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
          {next && (
            <span className="text-xs text-muted-foreground pb-2">
              Próximo envío: {next.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}


