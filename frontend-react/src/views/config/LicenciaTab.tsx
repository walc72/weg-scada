import { SkeletonTabla } from '../../components/ui/skeleton'
import { useRef, useState } from 'react'
import { useLicense, TIPO_LABEL } from '../../store/license'
import type { TipoEquipo } from '../../types'
import { fechaCorta } from '../../lib/licenciaAvisos'
import { useAuthStore } from '../../store/auth'
import { useServerStore } from '../../store/server'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Label } from '../../components/ui/label'
import { Copy, Loader2, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'

const TIERS = ['A', 'B', 'C'] as const
const TIER_LABELS = { A: 'Equipos simples', B: 'Equipos estándar', C: 'Equipos avanzados' }

export default function LicenciaTab() {
  const lic = useLicense(s => s.lic)
  const save = useLicense(s => s.save)
  const superadmin = useAuthStore(s => s.role === 'superadmin')
  const replica = useServerStore(s => s.replica)
  const canEdit = superadmin && !replica
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const renovar = useLicense(s => s.renovar)
  const [buscando, setBuscando] = useState(false)

  // Pide al panel la licencia vigente ahora (si no, llega sola en hasta 6 h)
  async function buscar() {
    setBuscando(true)
    try { toast.success(await renovar()) } catch (e: any) { toast.error(e.message) } finally { setBuscando(false) }
  }
  const idRef = useRef<HTMLElement>(null)

  async function copy() {
    const id = lic?.installId
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      toast.success('ID copiado')
    } catch {
      // sin permiso de portapapeles (http, iframe): dejar el ID seleccionado
      const el = idRef.current
      if (el) {
        const sel = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(el)
        sel?.removeAllRanges(); sel?.addRange(range)
      }
      toast.error('No se pudo copiar: copialo con Ctrl+C')
    }
  }

  async function submit() {
    setSaving(true); setError('')
    try {
      await save(text.trim())
      setText('')
      toast.success('Licencia guardada')
    } catch (e: any) {
      setError(e.message)
    } finally { setSaving(false) }
  }

  if (!lic) return <SkeletonTabla filas={4} />

  return (
    <div className="max-w-2xl">
      <Card className="p-4 space-y-4">
        <div>
          <Label>ID de instalación</Label>
          <div className="flex items-center gap-2 mt-1">
            <code ref={idRef} className="flex-1 min-w-0 break-all rounded border bg-muted px-2 py-1.5 text-sm select-all">{lic.installId || '—'}</code>
            <Button size="sm" variant="outline" onClick={copy} disabled={!lic.installId}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copiar
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <Label>Cliente</Label>
            <div className="mt-1">{lic.ok ? lic.cliente || '—' : 'Sin licencia'}</div>
          </div>
          <div>
            <Label>Uso</Label>
            <div className="mt-1 tabular-nums space-y-0.5">
              {lic.equipos
                ? (Object.keys(TIPO_LABEL) as TipoEquipo[]).map(t => <div key={t}>{TIPO_LABEL[t]}: {lic.usoEquipos?.[t] ?? 0}/{lic.equipos![t]}</div>)
                : TIERS.map(t => <div key={t}>{TIER_LABELS[t]} ({t}): {lic.uso[t]}/{lic.limites[t]}</div>)}
            </div>
          </div>
        </div>
        <div>
          <Label>Módulos</Label>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {lic.modulos.length ? lic.modulos.map(m => <Badge key={m} variant="secondary">{m}{lic.vencen?.[m] ? ` · prueba hasta ${fechaCorta(lic.vencen[m])}` : ''}</Badge>)
              : <span className="text-sm text-muted-foreground">Ninguno</span>}
            {lic.vencidos?.map(m => <Badge key={m} variant="outline" className="line-through text-muted-foreground">{m}</Badge>)}
          </div>
        </div>
        <div className="text-sm">
          <Label>Vencimiento</Label>
          <div className="mt-1">{lic.vence ? `${fechaCorta(lic.vence)}${lic.ok ? '' : ' (vencida)'}` : 'Permanente'}</div>
        </div>
        {canEdit && lic.panel && (
          <div className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
            <span className="text-muted-foreground">Licencia del panel de licencias: los cambios llegan solos en hasta 6 h.</span>
            <Button size="sm" variant="outline" disabled={buscando} onClick={buscar}>
              {buscando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Buscar actualización
            </Button>
          </div>
        )}
        {canEdit && (
          <div className="space-y-2 border-t pt-4">
            <Label>Texto de la licencia</Label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6} spellCheck={false}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
              placeholder="Pegá acá el texto de la licencia" />
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="flex justify-end">
              <Button size="sm" disabled={saving || !text.trim()} onClick={submit}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Guardar licencia
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
