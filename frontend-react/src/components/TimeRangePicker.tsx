import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, ChevronDown, ZoomOut, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TimeRange {
  windowMs: number   // duración de la ventana; 0 = rango fijo
  endOffset: number  // 0 = ahora, negativo = desplazado al pasado
  // Solo se usan cuando windowMs === 0:
  fixedStart?: number  // epoch ms
  fixedEnd?: number    // epoch ms
}

const PRESETS = [
  { label: 'Últimos 30 min',   ms: 30 * 60_000 },
  { label: 'Última 1 hora',    ms: 60 * 60_000 },
  { label: 'Últimas 7 horas',  ms: 7 * 60 * 60_000 },
  { label: 'Últimas 24 horas', ms: 24 * 60 * 60_000 },
  { label: 'Últimos 15 días',  ms: 15 * 24 * 60 * 60_000 },
  { label: 'Últimos 30 días',  ms: 30 * 24 * 60 * 60_000 },
]

function toInputVal(epoch: number) {
  const d = new Date(epoch)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function presetLabel(range: TimeRange) {
  if (range.windowMs === 0 && range.fixedStart != null && range.fixedEnd != null) {
    return `${fmtDate(range.fixedStart)} – ${fmtDate(range.fixedEnd)}`
  }
  if (range.endOffset !== 0) {
    const end   = new Date(Date.now() + range.endOffset)
    const start = new Date(Date.now() + range.endOffset - range.windowMs)
    return `${fmtTime(start)} – ${fmtTime(end)}`
  }
  return PRESETS.find(p => p.ms === range.windowMs)?.label ?? `Últimos ${range.windowMs / 1000}s`
}

function fmtTime(d: Date) {
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}

function fmtDate(epoch: number) {
  const d = new Date(epoch)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  value: TimeRange
  onChange: (r: TimeRange) => void
}

export default function TimeRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'presets' | 'custom'>('presets')

  const now = Date.now()
  const defaultStart = toInputVal(now - 60 * 60_000)
  const defaultEnd   = toInputVal(now)
  const [customStart, setCustomStart] = useState(defaultStart)
  const [customEnd,   setCustomEnd]   = useState(defaultEnd)

  const step = value.windowMs > 0 ? Math.round(value.windowMs / 4) : 30_000

  function shiftBack() {
    if (value.windowMs === 0 && value.fixedStart != null && value.fixedEnd != null) {
      const span = value.fixedEnd - value.fixedStart
      const shift = Math.round(span / 4)
      onChange({ ...value, fixedStart: value.fixedStart - shift, fixedEnd: value.fixedEnd - shift })
    } else {
      onChange({ ...value, endOffset: value.endOffset - step })
    }
  }

  function shiftForward() {
    if (value.windowMs === 0 && value.fixedStart != null && value.fixedEnd != null) {
      const span = value.fixedEnd - value.fixedStart
      const shift = Math.round(span / 4)
      const newEnd = Math.min(Date.now(), value.fixedEnd + shift)
      onChange({ ...value, fixedStart: value.fixedStart + shift, fixedEnd: newEnd })
    } else {
      const next = Math.min(0, value.endOffset + step)
      onChange({ ...value, endOffset: next })
    }
  }

  function zoomOut() {
    const next = value.windowMs > 0 ? value.windowMs * 2 : 60_000
    onChange({ windowMs: next, endOffset: 0 })
  }

  function selectPreset(ms: number) {
    onChange({ windowMs: ms, endOffset: 0 })
    setOpen(false)
  }

  function applyCustom() {
    const start = new Date(customStart).getTime()
    const end   = new Date(customEnd).getTime()
    if (isNaN(start) || isNaN(end) || end <= start) return
    onChange({ windowMs: 0, endOffset: 0, fixedStart: start, fixedEnd: end })
    setOpen(false)
  }

  const isLive = value.windowMs > 0 && value.endOffset === 0
  const isFixed = value.windowMs === 0

  const forwardDisabled = isLive || (isFixed && value.fixedEnd != null && value.fixedEnd >= Date.now())

  return (
    <div className="relative flex items-center gap-1">
      {/* Back */}
      <button
        onClick={shiftBack}
        className="p-1.5 rounded-md border border-input bg-background hover:bg-accent transition-colors"
        title="Retroceder"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Range label / dropdown */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors',
          open ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'
        )}
      >
        {isFixed ? <Calendar className="h-3.5 w-3.5 shrink-0" /> : <Clock className="h-3.5 w-3.5 shrink-0" />}
        <span className="whitespace-nowrap">{presetLabel(value)}</span>
        {isLive && (
          <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" title="En vivo" />
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-10 top-full mt-1 z-50 rounded-md border bg-popover shadow-lg min-w-[220px]">
          {/* Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => setTab('presets')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-semibold transition-colors',
                tab === 'presets' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Rápido
            </button>
            <button
              onClick={() => setTab('custom')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-semibold transition-colors',
                tab === 'custom' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Personalizado
            </button>
          </div>

          {tab === 'presets' && (
            <>
              {PRESETS.map(p => (
                <button
                  key={p.ms}
                  onClick={() => selectPreset(p.ms)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                    value.windowMs === p.ms && value.endOffset === 0 ? 'font-semibold text-primary' : ''
                  )}
                >
                  {p.label}
                </button>
              ))}
            </>
          )}

          {tab === 'custom' && (
            <div className="p-3 flex flex-col gap-2">
              <label className="text-xs text-muted-foreground">Desde</label>
              <input
                type="datetime-local"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground opacity-100"
              />
              <label className="text-xs text-muted-foreground">Hasta</label>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground opacity-100"
              />
              <button
                onClick={applyCustom}
                className="mt-1 w-full rounded-md bg-primary text-primary-foreground text-xs font-semibold py-1.5 hover:opacity-90 transition-opacity"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Forward */}
      <button
        onClick={shiftForward}
        disabled={forwardDisabled}
        className="p-1.5 rounded-md border border-input bg-background hover:bg-accent transition-colors disabled:opacity-30"
        title="Avanzar"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Zoom out */}
      <button
        onClick={zoomOut}
        className="p-1.5 rounded-md border border-input bg-background hover:bg-accent transition-colors"
        title="Alejar"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
    </div>
  )
}
