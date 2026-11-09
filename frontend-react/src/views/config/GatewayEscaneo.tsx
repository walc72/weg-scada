// Escaneo de gateways: PLC (slots del mapa %MW) y ADAM (Unit IDs del bus RS-485).
// El escaneo no guarda nada: PLC carga los slots en la edición; ADAM ofrece crear las bombas.
import { useId, useState } from 'react'
import { Loader2, Plus, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '../../store/config'
import { authFetch } from '../../store/auth'
import { useLicense } from '../../store/license'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Campo, useGuardando } from '../../components/config'
import type { GatewayConfig, GatewaySlot } from '../../types'
import type { Pedido } from './filas'
import { API_BASE } from './comun'
import { bombasDeUnits, scanDe } from './gateways'
import { exigir } from './equipos'

interface SlotDetectado { slot: number; detected: boolean; regOffset: number; statusOffset: number; current?: number }
interface UnitDetectada { unitId: number; detected: boolean; statusText?: string; voltage?: number; current?: number; hoursPowered?: number }

async function escanear<T>(body: object, clave: 'slots' | 'units'): Promise<T[] | null> {
  try {
    const r = await authFetch(`${API_BASE}/config/scan-gateway`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json())[clave] || []
  } catch {
    toast.error('Error al escanear el gateway')
    return null
  }
}

export const plural = (n: number, s: string) => `${n} ${s}${n !== 1 ? 's' : ''}`

export const subtitulo = 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'

function BotonEscanear({ cargando, onClick }: { cargando: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" disabled={cargando} onClick={onClick}>
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}ESCANEAR
    </Button>
  )
}

// `gw` = gateway en edición (el barrido usa el layout del scan todavía sin guardar)
export function EscaneoPlc({ gw, onUsar }: { gw: GatewayConfig; onUsar: (slots: GatewaySlot[]) => void }) {
  const [cargando, correr] = useGuardando()
  const [detectados, setDetectados] = useState<SlotDetectado[] | null>(null)
  const barrer = () => correr(async () => {
    const r = await escanear<SlotDetectado>({ ip: gw.ip, port: gw.port, unitId: 1, ...scanDe(gw) }, 'slots')
    const d = r?.filter(s => s.detected) ?? null
    setDetectados(d)
    if (d) toast.success(`Escaneo: ${plural(d.length, 'slot')} detectado${d.length !== 1 ? 's' : ''}`)
  })
  return (
    <div className="space-y-2 border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className={subtitulo}>Escaneo del PLC</h3>
        <div className="flex gap-2">
          {!!detectados?.length && (
            <Button size="sm" variant="outline" onClick={() => {
              onUsar(detectados.map(s => ({ id: s.slot, regOffset: s.regOffset, statusOffset: s.statusOffset })))
              setDetectados(null)
            }}>USAR ESTOS SLOTS</Button>
          )}
          <BotonEscanear cargando={cargando} onClick={barrer} />
        </div>
      </div>
      {detectados && (detectados.length === 0
        ? <p className="text-xs text-muted-foreground">No se detectaron slots con ese layout.</p>
        : (
          <Table className="text-xs">
            <TableHeader><TableRow>
              <TableHead>Slot</TableHead><TableHead>Reg offset</TableHead><TableHead>Status offset</TableHead><TableHead className="text-right">Corriente</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {detectados.map(s => (
                <TableRow key={s.slot}>
                  <TableCell className="font-mono">{s.slot}</TableCell>
                  <TableCell className="font-mono">{s.regOffset}</TableCell>
                  <TableCell className="font-mono">{s.statusOffset}</TableCell>
                  <TableCell className="text-right font-mono">{s.current ?? '—'} A</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
      <p className="text-xs text-muted-foreground">«Usar estos slots» los carga en la edición; quedan pendientes hasta guardar el gateway.</p>
    </div>
  )
}

// `gw` = gateway guardado; `bloqueado` mientras el gateway tiene cambios sin guardar
export function EscaneoAdam({ gw, bloqueado, pedir }: { gw: GatewayConfig; bloqueado: boolean; pedir: (p: Pedido) => void }) {
  const store = useConfigStore()
  const devices = store.config!.devices
  const fullB = useLicense(l => l.full('variadores'))
  const limitMsg = useLicense(l => l.limitMsg('variadores'))
  const [cargando, correr] = useGuardando()
  const [maxUnits, setMaxUnits] = useState(16)
  const idMax = useId()
  const [detectados, setDetectados] = useState<UnitDetectada[] | null>(null)

  const barrer = () => correr(async () => {
    const r = await escanear<UnitDetectada>({ ip: gw.ip, port: gw.port, kind: 'adam', maxUnits, statusOffset: 679 }, 'units')
    const d = r?.filter(u => u.detected) ?? null
    setDetectados(d)
    if (d) toast.success(`Escaneo: ${plural(d.length, 'drive')} en ${maxUnits} Unit IDs`)
  })

  const usados = new Set(devices.filter(d => d.gateway === gw.name).map(d => d.unitId))
  const units = (detectados ?? []).map(u => u.unitId)
  const nuevas = bombasDeUnits(gw, units, devices).length

  function pedirCrear() {
    pedir({
      titulo: `¿Crear ${plural(nuevas, 'bomba')}?`,
      mensaje: `Se agregan ${plural(nuevas, 'drive')} SSW900 en ${gw.name}, uno por Unit ID detectado.`,
      textoConfirmar: 'CREAR',
      accion: async () => {
        if (await store.guardar(c => { exigir(c.gateways, gw.name); return { ...c, devices: [...c.devices, ...bombasDeUnits(gw, units, c.devices)] } })) {
          toast.success(`${plural(nuevas, 'bomba')} creada${nuevas !== 1 ? 's' : ''}`)
          setDetectados(null)
        }
      },
    })
  }

  return (
    <div className="space-y-2 border p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className={subtitulo}>Bombas por Unit ID (RS-485)</h3>
        <div className="flex items-end gap-2">
          <Campo etiqueta="Máx Unit IDs" htmlFor={idMax}>
            <Input id={idMax} type="number" min={1} max={247} value={maxUnits} onChange={e => setMaxUnits(+e.target.value)} className="w-24 font-mono" />
          </Campo>
          <BotonEscanear cargando={cargando} onClick={barrer} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Barre los Unit IDs 1…{maxUnits} leyendo el mapa nativo del SSW (datos en 0, estado en 679). Puede tardar si hay Unit IDs sin responder.</p>
      {detectados && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{plural(detectados.length, 'drive')} detectado{detectados.length !== 1 ? 's' : ''}</span>
            <Button size="sm" variant="outline" disabled={fullB || bloqueado || nuevas === 0}
              title={fullB ? limitMsg : bloqueado ? 'Guardá el gateway antes de crear las bombas' : undefined} onClick={pedirCrear}>
              <Plus className="h-4 w-4" />CREAR {plural(nuevas, 'BOMBA')}
            </Button>
          </div>
          {detectados.length === 0
            ? <p className="text-xs text-muted-foreground">No se detectaron bombas en ese rango de Unit IDs.</p>
            : (
              <Table className="text-xs">
                <TableHeader><TableRow>
                  <TableHead>Unit ID</TableHead><TableHead>Estado</TableHead>
                  <TableHead className="text-right">Tensión</TableHead><TableHead className="text-right">Corriente</TableHead>
                  <TableHead className="text-right">Horas</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {detectados.map(u => (
                    <TableRow key={u.unitId}>
                      <TableCell className="font-mono font-medium">{u.unitId}</TableCell>
                      <TableCell><span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 bg-foreground" />{u.statusText || 'OK'}</span></TableCell>
                      <TableCell className="text-right font-mono">{u.voltage ?? '—'} V</TableCell>
                      <TableCell className="text-right font-mono">{u.current ?? '—'} A</TableCell>
                      <TableCell className="text-right font-mono">{u.hoursPowered ?? '—'} h</TableCell>
                      <TableCell className="text-right text-[11px] text-muted-foreground">{usados.has(u.unitId) ? 'ya cargado' : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </>
      )}
    </div>
  )
}
