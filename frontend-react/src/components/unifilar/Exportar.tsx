import { useState } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import { toPng } from 'html-to-image'
import { Download, FileImage, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { nombreArchivo } from '../../lib/exportar'

// espera a que el lienzo se redibuje tras el encuadre (sin requestAnimationFrame: no corre con la pestaña oculta)
const cuadro = () => new Promise(r => setTimeout(r, 100))
// Sin los controles de zoom ni la marca de React Flow
const fuera = (n: HTMLElement) => !n.classList?.contains('react-flow__controls') && !n.classList?.contains('react-flow__attribution')

// Exporta el dibujo entero con su encabezado: PNG para descargar o PDF por la impresión del navegador.
// `area` es el contenedor del lienzo; `conEncabezado` muestra el encabezado mientras se captura.
export default function Exportar({ area, rf, titulo, conEncabezado }: {
  area: React.RefObject<HTMLDivElement>; rf: ReactFlowInstance | null; titulo: string; conEncabezado: (on: boolean) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const capturar = async () => {
    if (!area.current || !rf) return null
    const vista = rf.getViewport()
    conEncabezado(true)
    rf.fitView({ padding: 0.08 })
    await cuadro()
    try {
      // fontEmbedCSS '' = no bajar las tipografías externas (sin internet en planta se colgaba); tope de 20 s
      const png = toPng(area.current, { pixelRatio: 2, backgroundColor: getComputedStyle(document.body).backgroundColor, filter: fuera, fontEmbedCSS: '' })
      const tope = new Promise<never>((_, no) => setTimeout(() => no(new Error('La exportación tardó demasiado')), 20000))
      return await Promise.race([png, tope])
    } finally {
      conEncabezado(false)
      rf.setViewport(vista)
    }
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

  const bt = 'inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:bg-muted'
  return (
    <div className="relative">
      <button type="button" className={bt} onClick={() => setAbierto(a => !a)} disabled={ocupado || !rf}>
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Exportar
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
