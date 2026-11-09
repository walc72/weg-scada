import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useBrandingStore, DEFAULT_BRANDING } from '../../store/branding'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { ConfirmarDialog } from '../../components/ui/confirmar-dialog'
import { RotateCcw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { SeccionConfig, Campo, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import { desregistrar, registrar } from '../../components/config/avisoSalida'
import { aplicarColorPortal } from '../../lib/color'
import { PALETA_DEFECTO, paletaEfectiva, aplicarPaleta, difPaleta, colorFase, colorConsigna, type PaletaParcial } from '../../lib/paleta'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

const MAX_LOGO_BYTES = 1024 * 1024
const MAX_FAVICON_BYTES = 256 * 1024

// Datos fijos del gráfico de muestra: 3 senoides desfasadas 120°
const MUESTRA = Array.from({ length: 48 }, (_, i) => {
  const t = (i / 48) * 4 * Math.PI
  return { x: i, a: Math.sin(t), b: Math.sin(t - (2 * Math.PI) / 3), c: Math.sin(t + (2 * Math.PI) / 3), k: 0.6 }
})

const FASES = [['a', 'A'], ['b', 'B'], ['c', 'C'], ['n', 'Neutro']] as const
const MAGNITUDES = [['tension', 'Tensión'], ['corriente', 'Corriente'], ['potencia', 'Potencia'], ['fp', 'Factor de potencia'], ['caudal', 'Caudal'], ['energia', 'Energía']] as const

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

// Botón «ELEGIR ARCHIVO» con el input de archivo oculto
function ElegirArchivo({ onElegir, etiqueta }: { onElegir: (e: React.ChangeEvent<HTMLInputElement>) => void; etiqueta: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button size="sm" variant="outline" aria-label={etiqueta} onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />ELEGIR ARCHIVO</Button>
      <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onElegir} />
    </>
  )
}

export default function BrandingTab() {
  const b = useBrandingStore()
  const original = useMemo(() => ({
    name: b.name, subtitle: b.subtitle, footer: b.footer, colorPortal: b.colorPortal, colorInforme: b.colorInforme, paleta: b.paleta ?? {} as PaletaParcial,
  }), [b.name, b.subtitle, b.footer, b.colorPortal, b.colorInforme, b.paleta])
  const ed = useEdicion(original)
  const v = ed.valor
  const patch = (p: Partial<typeof original>) => ed.set(x => ({ ...x, ...p }))
  const setPaleta = (f: (p: PaletaParcial) => PaletaParcial) => ed.set(x => ({ ...x, paleta: f(x.paleta) }))
  const [logo, setLogo] = useState<string | null>(null) // data URL pendiente de guardar
  const [favicon, setFavicon] = useState<string | null>(null)
  const [guardando, correr] = useGuardando()
  const [restaurar, setRestaurar] = useState(false)
  const sucio = ed.sucio || !!logo || !!favicon
  // Logo/favicon pendientes también cuentan para el aviso de salida (useEdicion solo ve sus campos)
  const pendienteRef = useRef(false)
  pendienteRef.current = !!logo || !!favicon
  const idAviso = useId()
  useEffect(() => { registrar(idAviso, () => pendienteRef.current); return () => desregistrar(idAviso) }, [idAviso])

  // muestra en vivo; al salir sin guardar vuelve al guardado
  useEffect(() => { aplicarColorPortal(v.colorPortal) }, [v.colorPortal])
  useEffect(() => () => aplicarColorPortal(useBrandingStore.getState().colorPortal), [])
  useEffect(() => { aplicarPaleta(v.paleta) }, [v.paleta])
  useEffect(() => () => aplicarPaleta(useBrandingStore.getState().paleta), [])

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/png', 'image/jpeg'].includes(f.type)) { toast.error('Solo PNG o JPG'); return }
    if (f.size > MAX_LOGO_BYTES) { toast.error('El logo supera 1 MB'); return }
    setLogo(await readAsDataUrl(f))
  }

  async function pickFavicon(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/png', 'image/jpeg'].includes(f.type)) { toast.error('Solo PNG o JPG'); return }
    if (f.size > MAX_FAVICON_BYTES) { toast.error('El favicon supera 256 KB'); return }
    setFavicon(await readAsDataUrl(f))
  }

  const guardar = () => correr(() => ed.guardar(async x => {
    if (!x.name.trim()) { toast.error('El nombre no puede quedar vacío'); return false }
    const r = await b.save({
      name: x.name.trim(), subtitle: x.subtitle.trim(), footer: x.footer.trim(), colorPortal: x.colorPortal, colorInforme: x.colorInforme,
      paleta: difPaleta(useBrandingStore.getState().paleta ?? {}, x.paleta), ...(logo ? { logo } : {}), ...(favicon ? { favicon } : {}),
    })
    if (!r.ok) { toast.error(`No se pudo guardar: ${r.error}`); return false }
    setLogo(null); setFavicon(null); toast.success('Marca guardada')
    return true
  }))

  const descartar = () => { ed.descartar(); setLogo(null); setFavicon(null) }

  const restore = () => correr(async () => {
    descartar() // sin esto, lo editado quedaba encima de los valores restaurados
    const r = await b.reset()
    if (r.ok) { setLogo(null); setFavicon(null); toast.success('Marca restaurada') }
    else toast.error(`No se pudo restaurar: ${r.error}`)
  })

  const ef = paletaEfectiva(v.paleta)

  return (
    <div className="max-w-3xl">
      <SeccionConfig titulo="MARCA"
        ayuda="Logo, ícono de la pestaña (favicon) y textos del login, del encabezado, del pie de página y de los reportes PDF. Solo afecta a este servidor."
        acciones={<Button size="sm" variant="outline" disabled={guardando} onClick={() => setRestaurar(true)}><RotateCcw className="h-4 w-4" />RESTAURAR POR DEFECTO</Button>}>
        <Campo etiqueta="Nombre" htmlFor="marca-nombre">
          <Input id="marca-nombre" value={v.name} maxLength={60} onChange={e => patch({ name: e.target.value })} placeholder={DEFAULT_BRANDING.name} />
        </Campo>
        <Campo etiqueta="Subtítulo del login" htmlFor="marca-subtitulo">
          <Input id="marca-subtitulo" value={v.subtitle} maxLength={200} onChange={e => patch({ subtitle: e.target.value })} placeholder="(vacío = sin subtítulo)" />
        </Campo>
        <Campo etiqueta={'Pie de página ("Powered by …")'} htmlFor="marca-pie">
          <Input id="marca-pie" value={v.footer} maxLength={80} onChange={e => patch({ footer: e.target.value })} placeholder="(vacío = sin pie de página)" />
        </Campo>
        <Campo etiqueta="Logo (PNG o JPG, máx. 1 MB)">
          <div className="flex items-center gap-3 flex-wrap">
            {/* fondo blanco fijo: así se ve el logo en el login y en el PDF */}
            <div className="bg-white rounded-sm px-4 py-3 border">
              <img src={logo || b.logoUrl} alt="Logo" className="h-10 w-auto max-w-[240px] object-contain block" />
            </div>
            <ElegirArchivo etiqueta="Elegir logo" onElegir={pick} />
            {logo && <span className="text-xs text-(--p3-text)">Sin guardar.</span>}
          </div>
        </Campo>
        <Campo etiqueta="Ícono de la pestaña (favicon) (PNG o JPG, máx. 256 KB)" ayuda="Cuadrado, idealmente 192×192 o 512×512 px.">
          <div className="flex items-center gap-3 flex-wrap">
            <img src={favicon || b.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain rounded-sm border bg-white" />
            <ElegirArchivo etiqueta="Elegir favicon" onElegir={pickFavicon} />
            {favicon && <span className="text-xs text-(--p3-text)">Sin guardar.</span>}
          </div>
        </Campo>
        <Campo etiqueta="Colores" ayuda="Los colores de estado de los equipos (enfriando, descongelando, alarma…) no cambian.">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <input type="color" aria-label="Color principal del portal" value={v.colorPortal ?? '#2563eb'} onChange={e => patch({ colorPortal: e.target.value })} className="h-8 w-12 cursor-pointer rounded-sm border bg-transparent p-0.5" />
              <div className="text-sm"><div className="font-medium">Portal</div><div className="text-xs text-muted-foreground">Botones, menú, pestañas y enlaces{v.colorPortal ? ` · ${v.colorPortal}` : ' · original'}</div></div>
              <Button size="sm" className="ml-auto" tabIndex={-1}>ASÍ SE VE UN BOTÓN</Button>
              {v.colorPortal && <Button size="sm" variant="outline" onClick={() => patch({ colorPortal: null })}>VOLVER AL ORIGINAL</Button>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="color" aria-label="Color del informe PDF" value={v.colorInforme} onChange={e => patch({ colorInforme: e.target.value })} className="h-8 w-12 cursor-pointer rounded-sm border bg-transparent p-0.5" />
              <div className="text-sm"><div className="font-medium">Informe PDF</div><div className="text-xs text-muted-foreground">Títulos, línea del encabezado y tablas · {v.colorInforme}</div></div>
              {/* muestra de una hoja del PDF: papel blanco fijo */}
              <div className="ml-auto w-40 rounded-sm border bg-white p-2" aria-hidden="true">
                <div className="h-0.5" style={{ background: v.colorInforme }} />
                <div className="mt-1.5 h-1.5 w-16 rounded-sm" style={{ background: v.colorInforme }} />
                <div className="mt-1.5 h-2.5 rounded-sm" style={{ background: v.colorInforme }} />
                <div className="mt-0.5 h-1.5 rounded-sm bg-gray-100" /><div className="mt-0.5 h-1.5 rounded-sm bg-gray-200" />
              </div>
              {v.colorInforme.toLowerCase() !== DEFAULT_BRANDING.colorInforme.toLowerCase() && <Button size="sm" variant="outline" onClick={() => patch({ colorInforme: DEFAULT_BRANDING.colorInforme })}>VOLVER AL ORIGINAL</Button>}
            </div>
          </div>
        </Campo>
        <Campo etiqueta="Colores de gráficos" ayuda="Fases, magnitudes, consigna y series de los gráficos. Los colores de estado no cambian.">
          <div className="space-y-2">
            <GrupoColores titulo="Fases" items={FASES.map(([k, n]) => ({ id: `fase.${k}`, label: `Color de la fase ${n}`, nombre: n, valor: ef.fase[k], defecto: PALETA_DEFECTO.fase[k], set: c => setPaleta(p => ({ ...p, fase: { ...p.fase, [k]: c } })) }))} />
            <GrupoColores titulo="Magnitudes" items={MAGNITUDES.map(([k, n]) => ({ id: `mag.${k}`, label: `Color de ${n.toLowerCase()}`, nombre: n, valor: ef.magnitud[k], defecto: PALETA_DEFECTO.magnitud[k], set: c => setPaleta(p => ({ ...p, magnitud: { ...p.magnitud, [k]: c } })) }))} />
            <GrupoColores titulo="Consigna" items={[{ id: 'consigna', label: 'Color de la consigna', nombre: 'Consigna', valor: ef.consigna, defecto: PALETA_DEFECTO.consigna, set: c => setPaleta(p => ({ ...p, consigna: c })) }]} />
            <GrupoColores titulo="Series" items={ef.series.map((s, i) => ({ id: `serie.${i}`, label: `Color de la serie ${i + 1}`, nombre: `Serie ${i + 1}`, valor: s, defecto: PALETA_DEFECTO.series[i], set: c => setPaleta(p => { const sr = [...(p.series ?? [])]; while (sr.length < 8) sr.push(null); sr[i] = c; return { ...p, series: sr } }) }))} />
            <div className="rounded-sm border bg-card p-2" aria-hidden="true">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={MUESTRA}>
                  <Line dataKey="a" stroke={colorFase('A')} dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line dataKey="b" stroke={colorFase('B')} dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line dataKey="c" stroke={colorFase('C')} dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line dataKey="k" stroke={colorConsigna()} dot={false} strokeWidth={2} strokeDasharray="5 4" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPaleta(() => ({}))}>RESTAURAR COLORES DE GRÁFICOS</Button>
          </div>
        </Campo>
        <BarraGuardado sucio={sucio} guardando={guardando} onDescartar={descartar} onGuardar={guardar} />
      </SeccionConfig>
      <ConfirmarDialog open={restaurar} titulo="¿Restaurar la marca por defecto?"
        mensaje="Vuelven el nombre, subtítulo, pie, logo, favicon y colores originales. No se puede deshacer."
        textoConfirmar="RESTAURAR" peligro
        onConfirmar={() => { setRestaurar(false); void restore() }} onCancelar={() => setRestaurar(false)} />
    </div>
  )
}

interface ItemColor { id: string; label: string; nombre: string; valor: string; defecto: string; set: (c: string) => void }

function GrupoColores({ titulo, items }: { titulo: string; items: ItemColor[] }) {
  return (
    <div>
      <Label className="mb-1 block">{titulo}</Label>
      <div className="flex gap-3 flex-wrap">
        {items.map(it => (
          <div key={it.id} className="flex items-center gap-2">
            <input type="color" aria-label={it.label} value={it.valor} onChange={e => it.set(e.target.value)} className="h-8 w-12 cursor-pointer rounded-sm border bg-transparent p-0.5" />
            <div className="text-xs"><div className="font-medium">{it.nombre}</div><div className="font-mono text-muted-foreground">{it.valor}{it.valor.toLowerCase() !== it.defecto.toLowerCase() && ` · personalizado (defecto ${it.defecto})`}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}
