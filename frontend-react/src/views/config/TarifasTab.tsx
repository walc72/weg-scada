import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '../../store/auth'
import { useConfigStore } from '../../store/config'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { SkeletonTabla } from '../../components/ui/skeleton'
import { ConfirmarDialog } from '../../components/ui/confirmar-dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { SeccionConfig, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import { API_BASE, MODE } from './comun'
import { agregarTarifa, asignar, borrarTarifa, sitiosDe, vacio, vigente, type ArchivoTarifas } from './tarifas'
import { ReportarInvalido, TarifaEditor, hoy, type Confirmar, type Mutar } from './TarifaEditor'

// Radix Select no admite value="": centinela para "ninguno"
const NINGUNO = '__ninguno__'
const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

const MOCK: ArchivoTarifas = {
  ...vacio(),
  tarifas: [{
    id: 't-mock0412', nombre: 'ANDE 412 Línea MT',
    versiones: [{
      desde: '2024-11-26',
      franjas: [{ nombre: 'Punta', precioKwh: 331.93, tramos: [{ dias: [1, 2, 3, 4, 5, 6], desde: 18, hasta: 22 }] }],
      resto: { nombre: 'Fuera de punta', precioKwh: 144.83 },
      potencia: { modo: 'unica', reservadaKw: 800, precioKw: 41126, precioExcesoKw: 87533 },
    }],
  }],
}

export default function TarifasTab() {
  const [archivo, setArchivo] = useState<ArchivoTarifas | null>(null)

  useEffect(() => {
    if (MODE === 'mock') { setArchivo(MOCK); return }
    authFetch(`${API_BASE}/tarifas`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ArchivoTarifas) => setArchivo(d))
      .catch((e: any) => toast.error(`No se pudieron cargar las tarifas: ${e.message}`))
  }, [])

  if (!archivo) return <SkeletonTabla />
  return <div className="max-w-3xl space-y-2"><TarifasSeccion archivo={archivo} onGuardado={setArchivo} /></div>
}

type Pedido = { titulo: string; mensaje: string; textoConfirmar: string; accion: () => void }

function TarifasSeccion({ archivo, onGuardado }: { archivo: ArchivoTarifas; onGuardado: (a: ArchivoTarifas) => void }) {
  const ed = useEdicion(archivo)
  const a = ed.valor
  const [guardando, correr] = useGuardando()
  const [editId, setEditId] = useState<string | null>(null)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const cfg = useConfigStore(s => s.config)
  const [invalidos, setInvalidos] = useState<ReadonlySet<string>>(new Set())
  const reportar = useCallback((id: string, malo: boolean) => setInvalidos(s => {
    if (s.has(id) === malo) return s
    const n = new Set(s)
    if (malo) n.add(id); else n.delete(id)
    return n
  }), [])

  // Los mutadores tiran Error con mensaje para el usuario (versión repetida, única versión…)
  const mutar: Mutar = f => { try { ed.set(f(ed.valor)) } catch (e: any) { toast.error(e.message) } }
  const confirmar: Confirmar = (titulo, mensaje, textoConfirmar, accion) => setPedido({ titulo, mensaje, textoConfirmar, accion })

  const guardar = () => correr(async () => {
    if (invalidos.size) { toast.error('Hay campos con valores inválidos'); return }
    let guardado: ArchivoTarifas | null = null
    const ok = await ed.guardar(async x => {
      if (MODE === 'mock') { toast.success('Guardado (demo)'); guardado = x; return true }
      try {
        const r = await authFetch(`${API_BASE}/tarifas`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(x) })
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
        guardado = d
        toast.success('Tarifas guardadas')
        return true
      } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`); return false }
    })
    if (ok && guardado) onGuardado(guardado)
  })

  function agregar() {
    let nombre = 'Nueva tarifa'
    for (let i = 2; a.tarifas.some(t => t.nombre.toLowerCase() === nombre.toLowerCase()); i++) nombre = `Nueva tarifa ${i}`
    const r = agregarTarifa(a, nombre)
    ed.set(r.archivo)
    setEditId(r.id)
  }

  const fecha = hoy()
  const sitios = sitiosDe(cfg ?? {})
  const huerfanos = Object.keys(a.asignacion).filter(s => !sitios.includes(s))
  // todos los medidores (los existentes no tienen dónde cargar el sitio); primero los del sitio
  const medidores = (s: string) => [...(cfg?.meters ?? [])].sort((a, b) => Number((b.site ?? '').trim() === s) - Number((a.site ?? '').trim() === s))
  const nombreMedidor = (n: string) => cfg?.meterNames?.[n] || n
  const quitar = (s: string) => ed.set(x => ({ ...x, asignacion: Object.fromEntries(Object.entries(x.asignacion).filter(([k]) => k !== s)) }))

  return (
    <SeccionConfig titulo="Tarifas eléctricas"
      ayuda="Tipos de tarifa (Pliego de ANDE) con su historial de precios, y qué tarifa y medidor de demanda usa cada sitio."
      acciones={<Button size="sm" variant="outline" disabled={a.tarifas.length >= 20} onClick={agregar}><Plus className="h-4 w-4" />AGREGAR TARIFA</Button>}>
      <div className="space-y-2">
        <Label>Tarifas</Label>
        {a.tarifas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay tarifas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Vigente desde</TableHead>
                <TableHead>Precios vigentes</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.tarifas.map(t => {
                const v = vigente(t, fecha)
                return (
                  <TableRow key={t.id} data-state={t.id === editId ? 'selected' : undefined}>
                    <TableCell>{t.nombre}</TableCell>
                    <TableCell className="font-mono">{v?.desde ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {v ? `${[...v.franjas, v.resto].map(f => `${f.nombre} ${num(f.precioKwh)}`).join(' · ')} ${a.moneda}/kWh` : '—'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" aria-label={`Editar ${t.nombre}`} onClick={() => setEditId(t.id)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Borrar ${t.nombre}`} className="text-destructive hover:text-destructive"
                        onClick={() => confirmar('Borrar tarifa', `Se borra «${t.nombre}» con todas sus versiones; los sitios que la usan quedan sin tarifa.`, 'Borrar',
                          () => { ed.set(x => borrarTarifa(x, t.id)); if (editId === t.id) setEditId(null) })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {editId && a.tarifas.some(t => t.id === editId) && (
        <ReportarInvalido.Provider value={reportar}>
          <TarifaEditor key={editId} archivo={a} id={editId} mutar={mutar} confirmar={confirmar} onCerrar={() => setEditId(null)} />
        </ReportarInvalido.Provider>
      )}

      <div className="space-y-2 border-t pt-3">
        <Label>Asignación por sitio</Label>
        {sitios.length + huerfanos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay sitios. Se toman del campo Sitio de bombas y medidores.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sitio</TableHead>
                <TableHead>Tarifa</TableHead>
                <TableHead>Medidor de demanda</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...sitios, ...huerfanos].map(s => {
                const x = a.asignacion[s] ?? { tarifa: null, medidor: null }
                const ms = medidores(s).map(m => m.name)
                const huerfano = huerfanos.includes(s)
                return (
                  <TableRow key={s}>
                    <TableCell className={huerfano ? 'text-muted-foreground' : undefined}>
                      {huerfano ? `${s || 'Sin sitio'} — sitio no encontrado` : s || 'Sin sitio'}
                    </TableCell>
                    <TableCell>
                      <Select value={x.tarifa ?? NINGUNO} onValueChange={v => ed.set(y => asignar(y, s, { tarifa: v === NINGUNO ? null : v }))}>
                        <SelectTrigger aria-label={`Tarifa de ${s || 'Sin sitio'}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NINGUNO}>Sin tarifa</SelectItem>
                          {a.tarifas.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={x.medidor ?? NINGUNO} onValueChange={v => ed.set(y => asignar(y, s, { medidor: v === NINGUNO ? null : v }))}>
                        <SelectTrigger aria-label={`Medidor de ${s || 'Sin sitio'}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NINGUNO}>Ninguno</SelectItem>
                          {ms.map(n => <SelectItem key={n} value={n}>{nombreMedidor(n)}</SelectItem>)}
                          {x.medidor && !ms.includes(x.medidor) && <SelectItem value={x.medidor}>{`${x.medidor} — no encontrado`}</SelectItem>}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      {huerfano && <Button size="sm" variant="destructive" onClick={() => quitar(s)}>QUITAR</Button>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <Label htmlFor="tarifa-perdidas">Tarifa para pérdidas</Label>
        <p className="text-sm text-muted-foreground">
          El informe de costos valora la pérdida con esta tarifa. La pérdida es la misma de siempre: medidor principal menos los que restan (Configuración → Balance).
        </p>
        <Select value={a.perdidas?.tarifa ?? NINGUNO} onValueChange={v => ed.set(y => ({ ...y, perdidas: { tarifa: v === NINGUNO ? null : v } }))}>
          <SelectTrigger id="tarifa-perdidas" className="w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NINGUNO}>Sin costear</SelectItem>
            {a.tarifas.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
      <ConfirmarDialog open={!!pedido} titulo={pedido?.titulo ?? ''} mensaje={pedido?.mensaje ?? ''} textoConfirmar={pedido?.textoConfirmar} peligro
        onCancelar={() => setPedido(null)} onConfirmar={() => { pedido?.accion(); setPedido(null) }} />
    </SeccionConfig>
  )
}
