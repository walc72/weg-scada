import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, Settings, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { CATALOGO, type Ancho, type ItemGadget } from '@/lib/gadgets'

const TALLA: Record<Ancho, string> = { 4: 'S', 6: 'M', 8: 'L', 12: 'XL' }

// Celda del Dashboard en modo edición: barra (asa, título, ▲▼, ancho, opciones, quitar) sobre el
// contenido vivo pero sin interacción. Las escuchas del arrastre van solo en el asa: el resto de la barra sigue andando.
export default function EdicionGadget({ item, className, primero, ultimo, conOpciones, onMover, onAncho, onOpciones, onQuitar, children }: {
  item: ItemGadget; className: string; primero: boolean; ultimo: boolean; conOpciones: boolean
  onMover: (delta: -1 | 1) => void; onAncho: (a: Ancho) => void; onOpciones: () => void; onQuitar: () => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const c = CATALOGO[item.tipo]
  // Tras ▲/▼ (React mueve el nodo y el botón puede quedar deshabilitado en un extremo) el foco vuelve
  // al mismo botón, o a la otra flecha, o al asa; si no, caería en <body>
  const grip = useRef<HTMLButtonElement>(null)
  const arriba = useRef<HTMLButtonElement>(null)
  const abajo = useRef<HTMLButtonElement>(null)
  const foco = useRef<-1 | 1 | null>(null)
  useLayoutEffect(() => {
    const f = foco.current
    if (f === null) return
    foco.current = null
    const orden = f === -1 ? [arriba, abajo] : [abajo, arriba]
    ;(orden.map(r => r.current).find(b => b && !b.disabled) ?? grip.current)?.focus()
  })
  const moverCon = (d: -1 | 1) => { foco.current = d; onMover(d) }
  return (
    // Translate y no Transform: con anchos distintos rectSortingStrategy escala y deformaría el contenido
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${className} relative flex flex-col ${isDragging ? 'z-10 opacity-80' : ''}`}>
      <div className="flex items-center gap-1 rounded-t-sm border border-b-0 bg-muted px-1">
        <Button ref={grip} variant="ghost" size="icon" aria-label={`Arrastrar ${c.titulo}`} className="cursor-grab touch-none" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </Button>
        {/* mismas clases que Label (etiqueta de la guía) */}
        <span className="mr-auto truncate text-[11px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">{c.titulo}</span>
        <Button ref={arriba} variant="ghost" size="icon" aria-label={`Subir ${c.titulo}`} disabled={primero} onClick={() => moverCon(-1)}><ChevronUp className="h-4 w-4" /></Button>
        <Button ref={abajo} variant="ghost" size="icon" aria-label={`Bajar ${c.titulo}`} disabled={ultimo} onClick={() => moverCon(1)}><ChevronDown className="h-4 w-4" /></Button>
        {c.anchos.length > 1 && (
          <Select value={String(item.ancho)} onValueChange={v => onAncho(Number(v) as Ancho)}>
            <SelectTrigger aria-label={`Ancho de ${c.titulo}`} className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {c.anchos.map(a => <SelectItem key={a} value={String(a)}>{TALLA[a]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {conOpciones && <Button variant="ghost" size="icon" aria-label={`Opciones de ${c.titulo}`} onClick={onOpciones}><Settings className="h-4 w-4" /></Button>}
        <Button variant="ghost" size="icon" aria-label={`Quitar ${c.titulo}`} onClick={onQuitar}><X className="h-4 w-4" /></Button>
      </div>
      <div className="pointer-events-none select-none border border-dashed border-input p-1">{children}</div>
    </div>
  )
}
