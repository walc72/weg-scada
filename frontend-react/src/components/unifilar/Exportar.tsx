import { useState } from 'react'
import { getViewportForBounds, type ReactFlowInstance } from '@xyflow/react'
import { toPng } from 'html-to-image'
import { toast } from 'sonner'
import { Download, FileImage, FileText, Loader2 } from 'lucide-react'
import { nombreArchivo } from '../../lib/exportar'

const ANCHO = 1920, ALTO = 1080, BANDA = 56  // imagen apaisada; banda superior para el encabezado

// Exporta el dibujo entero con encabezado: PNG para descargar o PDF por la impresión del navegador.
// Como indica React Flow, se captura `.react-flow__viewport` con un encuadre calculado (no toca la vista en pantalla).
export default function Exportar({ area, rf, titulo, planta }: {
  area: React.RefObject<HTMLDivElement>; rf: ReactFlowInstance | null; titulo: string; planta: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const capturar = async (): Promise<string | null> => {
    const vista = area.current?.querySelector<HTMLElement>('.react-flow__viewport')
    if (!vista || !rf) return null
    const fondo = getComputedStyle(document.body).backgroundColor
    const texto = getComputedStyle(document.body).color
    const vp = getViewportForBounds(rf.getNodesBounds(rf.getNodes()), ANCHO, ALTO - BANDA, 0.1, 2, 0.06)
    // fontEmbedCSS '' = no bajar tipografías externas (sin internet en planta se colgaba); tope de 20 s
    const png = toPng(vista, {
      backgroundColor: fondo, width: ANCHO, height: ALTO - BANDA, fontEmbedCSS: '',
      style: { width: `${ANCHO}px`, height: `${ALTO - BANDA}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
    })
    const tope = new Promise<never>((_, no) => setTimeout(() => no(new Error('La exportación tardó demasiado')), 20000))
    const dibujo = new Image()
    dibujo.src = await Promise.race([png, tope])
    await dibujo.decode()
    // encabezado: planta · dibujo · fecha y hora (foto del estado en ese momento)
    const c = document.createElement('canvas')
    c.width = ANCHO; c.height = ALTO
    const g = c.getContext('2d')!
    g.fillStyle = fondo; g.fillRect(0, 0, ANCHO, ALTO)
    g.drawImage(dibujo, 0, BANDA)
    g.fillStyle = texto; g.textBaseline = 'middle'
    g.font = 'bold 26px sans-serif'
    const cab = `${planta} · ${titulo}`
    g.fillText(cab, 32, BANDA / 2)
    g.font = '22px sans-serif'
    g.fillText(new Date().toLocaleString('es-AR', { hour12: false }), 32 + g.measureText(cab).width + 40, BANDA / 2)
    return c.toDataURL('image/png')
  }

  const correr = async (tipo: 'png' | 'pdf') => {
    setAbierto(false); setOcupado(true)
    try {
      const url = await capturar()
      if (!url) return
      if (tipo === 'png') {
        const a = document.createElement('a')
        a.href = url; a.download = nombreArchivo(titulo, new Date()); a.click()
      } else {
        // la imagen en un iframe aparte: apaisado y ajustada a la hoja, sin el CSS del portal
        const f = document.createElement('iframe')
        f.style.cssText = 'position:fixed;width:0;height:0;border:0'
        document.body.appendChild(f)
        const doc = f.contentDocument!
        doc.open()
        doc.write(`<!doctype html><title>${titulo.replace(/</g, '&lt;')}</title><style>@page{size:landscape;margin:1cm}html,body{margin:0}img{width:100%;height:100vh;object-fit:contain}</style><img src="${url}">`)
        doc.close()
        f.contentWindow!.onafterprint = () => f.remove()
        await new Promise(r => setTimeout(r, 300))
        f.contentWindow!.print()
        setTimeout(() => f.remove(), 60000)
      }
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    } finally { setOcupado(false) }
  }

  const bt = 'inline-flex items-center gap-1 border border-border bg-background px-2.5 min-h-[30px] text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent'
  return (
    <div className="relative">
      <button type="button" className={bt} onClick={() => setAbierto(a => !a)} disabled={ocupado || !rf}>
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}EXPORTAR
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-1 flex w-44 flex-col rounded border bg-card p-1 shadow-lg">
          <button type="button" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => correr('pdf')}><FileText className="h-3.5 w-3.5" />PDF (imprimir)</button>
          <button type="button" className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => correr('png')}><FileImage className="h-3.5 w-3.5" />Imagen PNG</button>
        </div>
      )}
    </div>
  )
}
