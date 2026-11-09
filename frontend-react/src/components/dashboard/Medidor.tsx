import { useMemo, useState } from 'react'
import { useConfigStore } from '../../store/config'
import PM8000Card from '../PM8000Card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select'
import { useDatosDashboard, type GadgetProps } from './GadgetMarco'
import { medidorPrincipal, nombreMedidor } from '@/lib/kpis'

// Medición de un medidor. La elección rápida en la tarjeta es local y no se guarda;
// el medidor guardado es la opción `medidor` (null = principal de config).
export default function Medidor({ opciones }: GadgetProps<{ medidor: string | null }>) {
  const { meterList, daily } = useDatosDashboard()
  const config = useConfigStore(s => s.config)
  const [elegido, setElegido] = useState<string | null>(null)
  const primary = config?.primaryMeter

  // elegido en la tarjeta → guardado en el gadget → principal de config → primero online → primero
  const hero = medidorPrincipal(meterList, elegido, opciones.medidor, primary)
  // Selector: el principal configurado primero, el resto en su orden
  const opcionesSel = useMemo(() => {
    const p = primary ? meterList.find(m => m.name === primary) : undefined
    return p ? [p, ...meterList.filter(m => m.name !== primary)] : meterList
  }, [meterList, primary])
  if (!hero) return null

  return (
    <PM8000Card m={hero} zones={config?.meters?.find(c => c.name === hero.name)?.ui?.zones} meterName={nombreMedidor(config, hero.name)} energyKwh={daily.get(hero.name)?.energyKwh}
      maxPowerKw={daily.get(hero.name)?.maxPowerKw ?? undefined} hero vertical
      selector={opcionesSel.length > 1 ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground tracking-widest">
          MEDIDOR
          <Select value={hero.name} onValueChange={setElegido}>
            <SelectTrigger aria-label="Medidor" className="h-7 text-xs max-w-[230px] text-foreground tracking-normal"><SelectValue /></SelectTrigger>
            <SelectContent>
              {opcionesSel.map(m => <SelectItem key={m.name} value={m.name}>{nombreMedidor(config, m.name)}{m.online ? '' : ' (sin com.)'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : undefined} />
  )
}
