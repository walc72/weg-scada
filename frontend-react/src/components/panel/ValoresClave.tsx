import type { ValorClave } from '../../lib/resumenEquipo'

export const ETIQUETA = 'text-[11px] uppercase tracking-wider text-muted-foreground'

// Grilla de 2 columnas: etiqueta chica arriba, valor grande con unidad abajo
export default function ValoresClave({ valores }: { valores: ValorClave[] }) {
  if (!valores.length) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {valores.map(v => (
        <div key={v.etiqueta} className="min-w-0">
          <dt className={ETIQUETA}>{v.etiqueta}</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {v.valor === '—' ? <span className="text-(--bar-stale)">—</span>
              : <>{v.valor}{v.unidad && <span className="ml-1 text-xs font-normal text-muted-foreground">{v.unidad}</span>}</>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
