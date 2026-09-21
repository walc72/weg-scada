import { memo, useLayoutEffect, useRef } from 'react'
import GaugeComponent from 'react-gauge-component'

interface Props {
  value: number
  label: string
  unit?: string
  min?: number
  max?: number
  redLow?: number
  green?: number
  yellow?: number
  c1?: string
  c2?: string
  c3?: string
  decimals?: number
  invert?: boolean
  bipolar?: boolean   // -1..+1 (factor de potencia)
  suffix?: string     // etiqueta junto al valor (ej. 'i'/'c' inductivo/capacitivo)
  plain?: boolean     // apaga la coloración por umbrales: arco y aguja en verde fijo
  stale?: boolean     // datos viejos: gauge en gris
  big?: boolean       // tamaño destacado (hero)
}

const GREY = '#9ca3af'

function fmtValue(v: number, decimals?: number): string {
  if (v == null || isNaN(v)) return '0'
  if (decimals != null) return v.toFixed(decimals)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (v % 1 !== 0) return v.toFixed(1)
  return v.toString()
}

function HalfGauge({
  value,
  label,
  unit = '',
  min = 0,
  max = 100,
  redLow,
  green = 60,
  yellow = 85,
  c1 = '#22c55e',
  c2 = '#f59e0b',
  c3 = '#ef4444',
  decimals,
  invert = false,
  bipolar = false,
  suffix = '',
  plain = false,
  stale = false,
  big = false,
}: Props) {

  const minV = bipolar ? -1 : min
  const maxV = bipolar ? 1 : max
  const val = Math.max(minV, Math.min(maxV, Number.isFinite(value) ? value : 0))

  // Sub-arcos = zonas por equipo (verde/amarillo/rojo)
  let subArcs: { limit: number; color: string }[]
  if (stale) {
    subArcs = [{ limit: maxV, color: GREY }]
  } else if (plain) {
    subArcs = [{ limit: maxV, color: c1 }]
  } else if (bipolar) {
    subArcs = [
      { limit: -0.85, color: c1 }, { limit: -0.7, color: c2 },
      { limit: 0.7, color: c3 }, { limit: 0.85, color: c2 }, { limit: 1, color: c1 },
    ]
  } else if (invert) {
    subArcs = [{ limit: green, color: c3 }, { limit: yellow, color: c2 }, { limit: maxV, color: c1 }]
  } else if (redLow !== undefined) {
    subArcs = [{ limit: redLow, color: c3 }, { limit: green, color: c1 }, { limit: yellow, color: c2 }, { limit: maxV, color: c3 }]
  } else {
    subArcs = [{ limit: green, color: c1 }, { limit: yellow, color: c2 }, { limit: maxV, color: c3 }]
  }

  const arcColor = stale ? GREY
    : plain ? c1
    : bipolar ? (Math.abs(val) >= 0.85 ? c1 : Math.abs(val) >= 0.7 ? c2 : c3)
    : invert ? (val >= yellow ? c1 : val >= green ? c2 : c3)
    : (redLow !== undefined && val < redLow ? c3 : val <= green ? c1 : val <= yellow ? c2 : c3)

  const display = fmtValue(val, bipolar ? (decimals ?? 2) : decimals)

  // react-gauge-component (1.2.x) solo pinta la aguja "needle" al crearla: si el
  // valor cruza de zona después, la mueve pero conserva el color inicial. Se
  // repinta a mano tras cada render (también cubre redibujos por resize).
  const pointerColor = stale ? GREY : arcColor
  const wrapRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    wrapRef.current?.querySelectorAll('g.pointer path, g.pointer circle')
      .forEach(el => el.setAttribute('fill', pointerColor))
  })

  return (
    <div className="text-center">
      <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">{label}</div>
      <div ref={wrapRef} className="mx-auto" style={{ maxWidth: big ? 190 : 150 }}>
        <GaugeComponent
          type="semicircle"
          value={val}
          minValue={minV}
          maxValue={maxV}
          arc={{ width: 0.24, padding: 0.01, cornerRadius: 2, subArcs }}
          pointer={{ type: 'needle', color: pointerColor, width: 12, length: 0.68, elastic: true }}
          labels={{
            valueLabel: { hide: true },
            tickLabels: { hideMinMax: true, defaultTickValueConfig: { hide: true } },
          }}
        />
      </div>
      {/* Valor debajo del gauge, tipografía y tamaño consistentes */}
      <div className={`font-semibold leading-none tabular-nums ${big ? 'text-2xl -mt-1' : 'text-lg -mt-0.5'}`}
        style={{ color: stale ? GREY : undefined }}>
        {display}
        {unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
        {suffix && (
          <span className="text-xs font-bold ml-1" style={{ color: stale ? GREY : undefined }}
            title={suffix === 'i' ? 'Inductivo (atraso)' : suffix === 'c' ? 'Capacitivo (adelanto)' : undefined}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(HalfGauge)
