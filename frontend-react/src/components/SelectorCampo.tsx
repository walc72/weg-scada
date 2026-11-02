import type { CampoConfig } from '../types'
import { porBanco } from './Fasorial'

// Selector de equipos para Tendencias (reguladores / reconectadores): botones agrupados por banco.
// multiple: cada botón prende o apaga su equipo por separado (siempre queda al menos uno), y cada
// banco suma "Todas" para ver sus fases juntas. Sin multiple: se elige un equipo.
export default function SelectorCampo({ cfgs, seleccion, onChange, multiple = false }: {
  cfgs: CampoConfig[]; seleccion: string[]; onChange: (v: string[]) => void; multiple?: boolean
}) {
  const btn = (activo: boolean) => `px-2.5 min-h-[30px] text-[11px] font-semibold tracking-wider whitespace-nowrap ${activo ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`
  const tocar = (n: string) => {
    if (!multiple) return onChange([n])
    const otra = seleccion.includes(n) ? seleccion.filter(x => x !== n) : [...seleccion, n]
    if (otra.length) onChange(cfgs.map(c => c.name).filter(x => otra.includes(x)))   // en el orden de la configuración
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {porBanco(cfgs).map(g => {
        const nombres = g.regs.map(r => r.name)
        const todas = nombres.every(n => seleccion.includes(n)) && seleccion.length === nombres.length
        return (
          <div key={g.banco ?? '_'} className="flex items-center gap-2">
            {g.banco && <span className="text-[11px] tracking-widest uppercase text-muted-foreground">{g.banco}</span>}
            <div role="group" aria-label={g.banco ?? 'Equipos'} className="inline-flex flex-wrap border border-border divide-x divide-border">
              {multiple && nombres.length > 1 && (
                <button type="button" aria-pressed={todas} onClick={() => onChange(nombres)} className={btn(todas)} title="Ver solo las fases de este banco, juntas">TODAS</button>
              )}
              {g.regs.map(c => (
                <button key={c.name} type="button" aria-pressed={seleccion.includes(c.name)} onClick={() => tocar(c.name)} className={btn(seleccion.includes(c.name))}>{c.name}</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
