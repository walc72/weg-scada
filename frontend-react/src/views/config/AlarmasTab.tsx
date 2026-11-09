import { useMemo } from 'react'
import { useConfigStore } from '../../store/config'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { SeccionConfig, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import { toast } from 'sonner'
import { conSetpoints, soloCampos, type Mapa } from './supervision'

// Umbrales que generan ALARMA en las bombas (los evalúa el poller cada ciclo:
// badge en el dashboard, panel "Alarmas activas" y aviso por correo/Telegram).
const ALARM_FIELDS: { key: string; label: string; step: string; hint?: string }[] = [
  { key: 'tempHigh', label: 'Temp. alta (°C)', step: '1', hint: 'IGBT en CFW900, SCR en SSW900' },
  { key: 'currentHigh', label: 'Corriente alta (A)', step: '1' },
  { key: 'commErrorMax', label: 'Máx. errores com.', step: '1', hint: 'Ciclos seguidos sin respuesta' },
]
const CAMPOS = ALARM_FIELDS.map(f => f.key)

type Umbrales = Mapa<Record<string, number>>
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

function conValor(u: Umbrales, clave: string, campo: string, v: number | null): Umbrales {
  const r = { ...u[clave] }
  if (v === null || Number.isNaN(v)) delete r[campo]; else r[campo] = v
  return { ...u, [clave]: r }
}

export default function AlarmasTab() {
  const store = useConfigStore()
  const cfg = store.config!
  const as = cfg.alarmSetpoints
  const types = useMemo(() => Array.from(new Set(cfg.devices.map(d => d.type))).sort(), [cfg.devices])
  const nombres = useMemo(() => cfg.devices.map(d => d.name), [cfg.devices])

  const defaults = useEdicion(useMemo(() => soloCampos(as?.defaults, types, CAMPOS), [as?.defaults, types]))
  const overrides = useEdicion(useMemo(() => soloCampos(as?.overrides, nombres, CAMPOS), [as?.overrides, nombres]))
  const [guardandoD, correrD] = useGuardando()
  const [guardandoO, correrO] = useGuardando()

  const guardarDefaults = () => correrD(async () => {
    if (await defaults.guardar(v => store.guardar(c => conSetpoints(c, 'defaults', v, CAMPOS)))) toast.success('Alarmas guardadas')
  })
  const guardarOverrides = () => correrO(async () => {
    if (await overrides.guardar(v => store.guardar(c => conSetpoints(c, 'overrides', v, CAMPOS)))) toast.success('Alarmas guardadas')
  })

  const encabezados = ALARM_FIELDS.map(f => <TableHead key={f.key} className="text-center" title={f.hint}>{f.label}</TableHead>)

  return (
    <div className="space-y-4">
      <SeccionConfig
        titulo="Alarmas de bombas · valores por defecto (por tipo)"
        ayuda={<>
          Cuando un valor supera su umbral, la bomba muestra <strong>ALARMA</strong> en el dashboard, aparece en
          "Alarmas activas" y, si el correo/Telegram está configurado, se envía un aviso. La temperatura es la del
          IGBT en CFW900 y la del SCR en SSW900. Un campo vacío en una bomba usa el valor por defecto de su tipo;
          sin valor = sin alarma.
        </>}
      >
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              {encabezados}
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map(t => (
              <TableRow key={t}>
                <TableCell className="font-bold">{t}</TableCell>
                {ALARM_FIELDS.map(f => (
                  <TableCell key={f.key} className="p-1">
                    <Input type="number" step={f.step} value={defaults.valor[t]?.[f.key] ?? ''}
                      onChange={(e) => defaults.set(u => conValor(u, t, f.key, num(e.target.value)))} className="h-8 text-center w-24 mx-auto" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <BarraGuardado sucio={defaults.sucio} guardando={guardandoD} onDescartar={defaults.descartar} onGuardar={guardarDefaults} />
      </SeccionConfig>

      <SeccionConfig titulo="Alarmas de bombas · por bomba" ayuda="Vacío = usa el valor por defecto, en gris.">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Bomba</TableHead>
              <TableHead>Tipo</TableHead>
              {encabezados}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cfg.devices.map(d => (
              <TableRow key={d.name}>
                <TableCell className="font-medium whitespace-nowrap">{d.name}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{d.type}</Badge></TableCell>
                {ALARM_FIELDS.map(f => (
                  <TableCell key={f.key} className="p-1">
                    <Input type="number" step={f.step} value={overrides.valor[d.name]?.[f.key] ?? ''}
                      placeholder={String(defaults.valor[d.type]?.[f.key] ?? '—')}
                      onChange={(e) => overrides.set(u => conValor(u, d.name, f.key, num(e.target.value)))} className="h-8 text-center w-24 mx-auto" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <BarraGuardado sucio={overrides.sucio} guardando={guardandoO} onDescartar={overrides.descartar} onGuardar={guardarOverrides} />
      </SeccionConfig>
    </div>
  )
}
