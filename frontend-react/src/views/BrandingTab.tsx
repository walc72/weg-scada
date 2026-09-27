import { useEffect, useState } from 'react'
import { useBrandingStore, DEFAULT_BRANDING } from '../store/branding'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Loader2, Save, RotateCcw, Upload } from 'lucide-react'
import { toast } from 'sonner'

const MAX_LOGO_BYTES = 1024 * 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

export default function BrandingTab() {
  const b = useBrandingStore()
  const [name, setName] = useState(b.name)
  const [subtitle, setSubtitle] = useState(b.subtitle)
  const [logo, setLogo] = useState<string | null>(null) // data URL pendiente de guardar
  const [saving, setSaving] = useState(false)

  useEffect(() => { setName(b.name); setSubtitle(b.subtitle) }, [b.name, b.subtitle])

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/png', 'image/jpeg'].includes(f.type)) { toast.error('Solo PNG o JPG'); return }
    if (f.size > MAX_LOGO_BYTES) { toast.error('El logo supera 1 MB'); return }
    setLogo(await readAsDataUrl(f))
  }

  async function save() {
    if (!name.trim()) { toast.error('El nombre no puede quedar vacío'); return }
    setSaving(true)
    const r = await b.save({ name: name.trim(), subtitle: subtitle.trim(), ...(logo ? { logo } : {}) })
    setSaving(false)
    if (r.ok) { setLogo(null); toast.success('Marca guardada') }
    else toast.error(`No se pudo guardar: ${r.error}`)
  }

  async function restore() {
    if (!confirm('¿Restaurar nombre, subtítulo y logo por defecto?')) return
    setSaving(true)
    const r = await b.reset()
    setSaving(false)
    if (r.ok) { setLogo(null); toast.success('Marca restaurada') }
    else toast.error(`No se pudo restaurar: ${r.error}`)
  }

  return (
    <div className="max-w-2xl">
      <Card className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Logo y textos del login, del encabezado y de los reportes PDF. Solo afecta a este servidor.
        </p>
        <div>
          <Label>Nombre</Label>
          <Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={DEFAULT_BRANDING.name} />
        </div>
        <div>
          <Label>Subtítulo del login</Label>
          <Input value={subtitle} maxLength={200} onChange={e => setSubtitle(e.target.value)} placeholder="(vacío = sin subtítulo)" />
        </div>
        <div className="space-y-2">
          <Label>Logo (PNG o JPG, máx. 1 MB)</Label>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="bg-white rounded-xl px-4 py-3 border">
              <img src={logo || b.logoUrl} alt="Logo" className="h-12 w-auto max-w-[240px] object-contain block" />
            </div>
            <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer border border-input rounded-md px-3 h-9 hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />Elegir archivo
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={pick} />
            </label>
            {logo && <span className="text-xs text-muted-foreground">sin guardar</span>}
          </div>
        </div>
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="outline" disabled={saving} onClick={restore}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Restaurar por defecto
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  )
}
