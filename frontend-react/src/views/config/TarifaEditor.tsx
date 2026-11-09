import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Campo, useAvisoPendiente } from '../../components/config'
import { cn } from '@/lib/utils'
import {
  borrarVersion, editarVersion, nuevaVersion, precargarAnde,
  type ArchivoTarifas, type Cargo, type Franja, type Tramo, type Version,
} from './tarifas'

export type Mutar = (f: (a: ArchivoTarifas) => ArchivoTarifas) => void
export type Confirmar = (titulo: string, mensaje: string, textoConfirmar: string, accion: () => void) => void

// Fecha local AAAA-MM-DD (sv-SE usa ese formato)
export const hoy = () => new Date().toLocaleDateString('sv-SE')

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const HORAS = Array.from({ length: 25 }, (_, h) => String(h))
const CARGO0: Cargo = { reservadaKw: 0, precioKw: 0, precioExcesoKw: 0 }

// Acepta coma decimal ("331,93"); vacío, negativo o basura = inválido
const parsear = (s: string) => {
  const n = Number(s.trim().replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

// Número editable: el texto vive local mientras se tipea; el modelo recibe solo valores válidos
function Num({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  const [txt, setTxt] = useState<string | null>(null)
  const malo = txt !== null && parsear(txt) === null
  useAvisoPendiente(malo)
  return (
    <Input id={id} inputMode="decimal" aria-invalid={malo} className={cn('font-mono', malo && 'border-destructive')}
      value={txt ?? String(value).replace('.', ',')}
      onChange={e => { setTxt(e.target.value); const n = parsear(e.target.value); if (n !== null) onChange(n) }}
      onBlur={() => { if (!malo) setTxt(null) }} />
  )
}

function FechaVersion({ desde, ocupadas, onChange }: { desde: string; ocupadas: string[]; onChange: (d: string) => void }) {
  const [txt, setTxt] = useState<string | null>(null)
  const error = (s: string) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) ? 'Formato AAAA-MM-DD.'
      : s !== desde && ocupadas.includes(s) ? 'Ya existe una versión con esa fecha.' : null
  const err = txt === null ? null : error(txt)
  useAvisoPendiente(err !== null)
  return (
    <Campo etiqueta="Vigente desde" htmlFor="tarifa-desde">
      <Input id="tarifa-desde" placeholder="AAAA-MM-DD" aria-invalid={!!err} className={cn('w-36 font-mono', err && 'border-destructive')}
        value={txt ?? desde}
        onChange={e => { const s = e.target.value; setTxt(s); if (!error(s) && s !== desde) onChange(s) }}
        onBlur={() => { if (!err) setTxt(null) }} />
      {err && <p className="text-xs text-destructive">{err}</p>}
    </Campo>
  )
}

function Hora({ value, onChange, etiqueta }: { value: number; onChange: (h: number) => void; etiqueta: string }) {
  return (
    <Select value={String(value)} onValueChange={h => onChange(+h)}>
      <SelectTrigger className="h-7 w-16 font-mono" aria-label={etiqueta}><SelectValue /></SelectTrigger>
      <SelectContent>{HORAS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function CargoCampos({ titulo, cargo, moneda, onChange }: { titulo?: string; cargo: Cargo; moneda: string; onChange: (c: Cargo) => void }) {
  const p = titulo ? `${titulo} — ` : ''
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Campo etiqueta={`${p}Reservada (kW)`}><Num value={cargo.reservadaKw} onChange={n => onChange({ ...cargo, reservadaKw: n })} /></Campo>
      <Campo etiqueta={`${p}Precio (${moneda}/kW-mes)`}><Num value={cargo.precioKw} onChange={n => onChange({ ...cargo, precioKw: n })} /></Campo>
      <Campo etiqueta={`${p}Exceso (${moneda}/kW-mes)`}><Num value={cargo.precioExcesoKw} onChange={n => onChange({ ...cargo, precioExcesoKw: n })} /></Campo>
    </div>
  )
}

export function TarifaEditor({ archivo, id, mutar, confirmar, onCerrar }: {
  archivo: ArchivoTarifas; id: string; mutar: Mutar; confirmar: Confirmar; onCerrar: () => void
}) {
  const t = archivo.tarifas.find(x => x.id === id)!
  const [sel, setSel] = useState<string | null>(null)
  const v = t.versiones.find(x => x.desde === sel) ?? t.versiones[t.versiones.length - 1]
  const idx = t.versiones.indexOf(v)
  const m = archivo.moneda

  const ev = (fn: (v: Version) => Version) => mutar(a => editarVersion(a, id, v.desde, fn))
  const setF = (i: number, fn: (f: Franja) => Franja) => ev(x => ({ ...x, franjas: x.franjas.map((f, j) => j === i ? fn(f) : f) }))
  const setT = (i: number, k: number, fn: (t: Tramo) => Tramo) => setF(i, f => ({ ...f, tramos: f.tramos.map((x, j) => j === k ? fn(x) : x) }))
  const modo = v.potencia?.modo ?? 'ninguna'

  function nueva() {
    const d = hoy()
    mutar(a => nuevaVersion(a, id, d))
    setSel(d)
  }

  return (
    <div className="space-y-4 rounded-sm border border-border p-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <Campo etiqueta="Nombre" htmlFor="tarifa-nombre">
            <Input id="tarifa-nombre" value={t.nombre} maxLength={60}
              onChange={e => { const nombre = e.target.value; mutar(a => ({ ...a, tarifas: a.tarifas.map(x => x.id === id ? { ...x, nombre } : x) })) }} />
          </Campo>
        </div>
        <Button variant="outline" onClick={onCerrar}>CERRAR</Button>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <Campo etiqueta="Versión">
          <Select value={v.desde} onValueChange={setSel}>
            <SelectTrigger className="w-40 font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>{t.versiones.map(x => <SelectItem key={x.desde} value={x.desde}>{x.desde}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <FechaVersion key={`${id}:${idx}`} desde={v.desde} ocupadas={t.versiones.map(x => x.desde)}
          onChange={d => { ev(x => ({ ...x, desde: d })); setSel(d) }} />
        <Button variant="outline" onClick={nueva}><Plus className="h-4 w-4" />NUEVA VERSIÓN</Button>
        <Button variant="destructive" disabled={t.versiones.length <= 1}
          onClick={() => confirmar('Borrar versión', `Se borra la versión vigente desde ${v.desde}.`, 'Borrar', () => { mutar(a => borrarVersion(a, id, v.desde)); setSel(null) })}>
          BORRAR VERSIÓN
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Cada día se costea con la versión que regía ese día. Nueva versión copia la última con fecha de hoy.</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Franjas</Label>
          <Button size="sm" variant="outline"
            onClick={() => v.franjas.length
              ? confirmar('Precargar ANDE', 'Se reemplazan las franjas por Punta (lunes a sábado, 18 a 22 h). El precio fuera de punta se conserva.', 'Precargar', () => ev(precargarAnde))
              : ev(precargarAnde)}>
            PRECARGAR ANDE
          </Button>
        </div>
        {v.franjas.length === 0 && <p className="text-xs text-muted-foreground">Sin franjas: tarifa monómica, todo se cobra al precio del resto.</p>}
        {v.franjas.map((f, i) => (
          <div key={i} className="space-y-2 rounded-sm border border-border p-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-40"><Campo etiqueta="Nombre"><Input value={f.nombre} maxLength={30} onChange={e => { const nombre = e.target.value; setF(i, x => ({ ...x, nombre })) }} /></Campo></div>
              <div className="w-40"><Campo etiqueta={`Precio (${m}/kWh)`}><Num value={f.precioKwh} onChange={n => setF(i, x => ({ ...x, precioKwh: n }))} /></Campo></div>
              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Quitar franja ${f.nombre}`}
                onClick={() => ev(x => ({ ...x, franjas: x.franjas.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {f.tramos.map((tr, k) => (
              <div key={k} className="flex items-center gap-1 flex-wrap">
                {DIAS.map((d, j) => {
                  const on = tr.dias.includes(j + 1)
                  return (
                    <Button key={j} size="sm" variant={on ? 'default' : 'outline'} className="w-7 px-0" aria-pressed={on} aria-label={NOMBRE_DIA[j]}
                      onClick={() => setT(i, k, x => ({ ...x, dias: on ? x.dias.filter(n => n !== j + 1) : [...x.dias, j + 1].sort((p, q) => p - q) }))}>
                      {d}
                    </Button>
                  )
                })}
                <span className="ml-2 text-xs text-muted-foreground">de</span>
                <Hora etiqueta="Desde (h)" value={tr.desde} onChange={h => setT(i, k, x => ({ ...x, desde: h }))} />
                <span className="text-xs text-muted-foreground">a</span>
                <Hora etiqueta="Hasta (h)" value={tr.hasta} onChange={h => setT(i, k, x => ({ ...x, hasta: h }))} />
                <span className="text-xs text-muted-foreground">h</span>
                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Quitar tramo"
                  onClick={() => setF(i, x => ({ ...x, tramos: x.tramos.filter((_, j) => j !== k) }))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setF(i, x => ({ ...x, tramos: [...x.tramos, { dias: [1, 2, 3, 4, 5], desde: 0, hasta: 24 }] }))}>
              <Plus className="h-4 w-4" />AGREGAR TRAMO
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" disabled={v.franjas.length >= 6}
          onClick={() => ev(x => ({ ...x, franjas: [...x.franjas, { nombre: 'Punta', precioKwh: 0, tramos: [{ dias: [1, 2, 3, 4, 5, 6], desde: 18, hasta: 22 }] }] }))}>
          <Plus className="h-4 w-4" />AGREGAR FRANJA
        </Button>
        <p className="text-xs text-muted-foreground">Desde incluido, hasta excluido. Un tramo no cruza la medianoche: 22 a 2 se carga como 22 a 24 más 0 a 2.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo etiqueta="Resto — nombre"><Input value={v.resto.nombre} maxLength={30} onChange={e => { const nombre = e.target.value; ev(x => ({ ...x, resto: { ...x.resto, nombre } })) }} /></Campo>
        <Campo etiqueta={`Resto — precio (${m}/kWh)`}><Num value={v.resto.precioKwh} onChange={n => ev(x => ({ ...x, resto: { ...x.resto, precioKwh: n } }))} /></Campo>
      </div>

      <div className="space-y-3">
        <div className="w-48">
          <Campo etiqueta="Potencia">
            <Select value={modo} onValueChange={md => ev(x => ({
              ...x,
              potencia: md === 'unica' ? { modo: 'unica', ...CARGO0 } : md === 'diferencial' ? { modo: 'diferencial', punta: CARGO0, fuera: CARGO0 } : null,
            }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Ninguna</SelectItem>
                <SelectItem value="unica">Única</SelectItem>
                <SelectItem value="diferencial">Diferencial</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        </div>
        {v.potencia?.modo === 'unica' && (
          <CargoCampos cargo={v.potencia} moneda={m} onChange={c => ev(x => ({ ...x, potencia: { modo: 'unica', ...c } }))} />
        )}
        {v.potencia?.modo === 'diferencial' && (<>
          <CargoCampos titulo="Punta" cargo={v.potencia.punta} moneda={m}
            onChange={c => ev(x => x.potencia?.modo === 'diferencial' ? { ...x, potencia: { ...x.potencia, punta: c } } : x)} />
          <CargoCampos titulo="Fuera de punta" cargo={v.potencia.fuera} moneda={m}
            onChange={c => ev(x => x.potencia?.modo === 'diferencial' ? { ...x, potencia: { ...x.potencia, fuera: c } } : x)} />
        </>)}
      </div>
    </div>
  )
}
