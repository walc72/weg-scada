import type { CampoConfig } from '../types'
import { porBanco } from './Fasorial'

// Selector de equipo para Tendencias (reguladores / reconectadores): botones agrupados por banco.
// Con `bancoCompleto`, cada banco suma un botón "Todas las fases" (valor "banco:<nombre>").
export default function SelectorCampo({ cfgs, valor, onChange, bancoCompleto = false }: {
  cfgs: CampoConfig[]; valor: string; onChange: (v: string) => void; bancoCompleto?: boolean
}) {
  const btn = (activo: boolean) => `px-2.5 min-h-[30px] text-[11px] font-semibold tracking-wider whitespace-nowrap ${activo ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {porBanco(cfgs).map(g => (
        <div key={g.banco ?? '_'} className="flex items-center gap-2">
          {g.banco && <span className="text-[11px] tracking-widest uppercase text-muted-foreground">{g.banco}</span>}
          <div role="group" aria-label={g.banco ?? 'Equipos'} className="inline-flex flex-wrap border border-border divide-x divide-border">
            {bancoCompleto && g.banco && g.regs.length > 1 && (
              <button type="button" aria-pressed={valor === `banco:${g.banco}`} onClick={() => onChange(`banco:${g.banco}`)} className={btn(valor === `banco:${g.banco}`)}>TODAS LAS FASES</button>
            )}
            {g.regs.map(c => (
              <button key={c.name} type="button" aria-pressed={valor === c.name} onClick={() => onChange(c.name)} className={btn(valor === c.name)}>{c.name}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
