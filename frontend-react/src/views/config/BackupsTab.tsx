// Configuración → Backups (spec backup externo §6): estado, programación, cifrado, destinos e historial.
import { SkeletonTabla } from '../../components/ui/skeleton'
import { useEffect, useMemo, useState } from 'react'
import { useBackup, backupApi } from '../../store/backup'
import type { BackupInfo, BackupParte, BackupProgramacion, BackupRun } from '../../types'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Loader2, Play, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { SeccionConfig, Campo, BarraGuardado, useEdicion, useGuardando } from '../../components/config'
import BackupDestinos from '../BackupDestinos'

export const PARTE_LABEL: Record<BackupParte, string> = { config: 'Configuración', historico: 'Histórico' }
const DESTINO_LABEL: Record<string, string> = { local: 'Local', externo: 'Disco externo', drive: 'Google Drive', sftp: 'SFTP' }

export const fmtFecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—')
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export function fmtBytes(n: number) {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}
function fmtDuracion(r: BackupRun) {
  const s = Math.max(0, Math.round((Date.parse(r.fin) - Date.parse(r.inicio)) / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

// "ok" | "error <msg>" | "omitido"
function DestinoResultado({ nombre, valor }: { nombre: string; valor: string }) {
  const label = DESTINO_LABEL[nombre] || nombre
  if (valor === 'ok') return <span className="text-foreground">✓ {label}</span>
  if (valor === 'omitido') return <span className="text-muted-foreground">– {label} (omitido)</span>
  return <span className="text-destructive">✗ {label}: {valor.replace(/^error\s*/, '')}</span>
}

export default function BackupsTab() {
  const info = useBackup(s => s.info)
  const load = useBackup(s => s.load)
  const [pedido, setPedido] = useState(0) // polls restantes (3 s) tras "Hacer backup ahora": run.sh mira los pedidos cada 5 s (margen por si hay un backup en curso)

  // Los formularios toman sus valores al montar: se espera un GET propio (el del aviso de la App puede ser viejo)
  const [fresco, setFresco] = useState(false)
  useEffect(() => { load().finally(() => setFresco(true)) }, [])
  const enCurso = info?.estado?.enCurso
  // Avance: GET cada 3 s mientras corre (o mientras se espera que arranque el pedido)
  useEffect(() => {
    if (!enCurso && !pedido) return
    const t = setInterval(() => { load(); if (!enCurso) setPedido(p => (p > 0 ? p - 1 : 0)) }, 3000)
    return () => clearInterval(t)
  }, [!!enCurso, !!pedido])
  // Al arrancar una parte quedan 3 consultas de margen: con "Todo" la siguiente parte arranca enseguida
  useEffect(() => { if (enCurso) setPedido(3) }, [!!enCurso])

  if (!fresco) return <SkeletonTabla filas={3} />
  if (!info) return <div className="text-sm text-destructive py-8 text-center">No se pudo cargar la configuración de backup.</div>
  if (!info.modulo) return <div className="text-sm text-muted-foreground py-8 text-center">La licencia no incluye el módulo backup.</div>

  async function ahora(partes: BackupParte[]) {
    try { await backupApi('/ahora', 'POST', { partes }); toast.success('Backup pedido'); setPedido(25); load() }
    catch (e: any) { toast.error(e.message) }
  }

  const estado = info.estado
  return (
    <div className="space-y-4">
      <div className="max-w-3xl space-y-4">
        <SeccionConfig titulo="ESTADO">
          <div className="grid gap-4 sm:grid-cols-2">
            {(['config', 'historico'] as const).map(p => {
              const r = estado?.ultima?.[p]
              return (
                <div key={p} className="space-y-1 text-sm">
                  <div className="font-medium flex items-center gap-2">
                    {PARTE_LABEL[p]}
                    {r && <Badge variant={r.ok ? 'success' : 'destructive'}>{r.ok ? 'OK' : 'Con errores'}</Badge>}
                  </div>
                  {r ? (
                    <>
                      <div className="text-muted-foreground">Último: {fmtFecha(r.inicio)} · {fmtBytes(r.bytes)}</div>
                      <div className="flex flex-col">{Object.entries(r.destinos).map(([k, v]) => <DestinoResultado key={k} nombre={k} valor={v} />)}</div>
                      {r.error && <div className="text-destructive">{r.error}</div>}
                    </>
                  ) : <div className="text-muted-foreground">Todavía no hay backups</div>}
                  <div className="text-muted-foreground">Próximo: {estado?.proxima?.[p] ? fmtFecha(estado.proxima[p]) : 'Desactivado'}</div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {enCurso ? (
              <span className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />En curso: {PARTE_LABEL[enCurso.parte]} desde {fmtHora(enCurso.desde)}</span>
            ) : (
              <>
                <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mr-1">Hacer backup ahora</span>
                <Button size="sm" variant="outline" disabled={!!pedido} onClick={() => ahora(['config'])}><Play className="h-4 w-4" />CONFIGURACIÓN</Button>
                <Button size="sm" variant="outline" disabled={!!pedido} onClick={() => ahora(['historico'])}><Play className="h-4 w-4" />HISTÓRICO</Button>
                <Button size="sm" variant="outline" disabled={!!pedido} onClick={() => ahora(['config', 'historico'])}><Play className="h-4 w-4" />TODO</Button>
                {!!pedido && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </>
            )}
          </div>
        </SeccionConfig>

        <Programacion info={info} onSaved={load} />
        <Cifrado configurada={!!info.fraseConfigurada} onSaved={load} />
        <BackupDestinos info={info} reload={load} />
      </div>

      <SeccionConfig titulo="HISTORIAL" className="overflow-x-auto">
        {estado?.historial?.length ? (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Fecha</TableHead><TableHead>Parte</TableHead><TableHead>Tamaño</TableHead><TableHead>Duración</TableHead><TableHead>Destinos</TableHead><TableHead>Error</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {estado.historial.slice(0, 30).map((r, i) => (
                <TableRow key={`${r.parte}-${r.inicio}-${i}`}>
                  <TableCell className="whitespace-nowrap">{fmtFecha(r.inicio)}</TableCell>
                  <TableCell>{PARTE_LABEL[r.parte] || r.parte}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtBytes(r.bytes)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDuracion(r)}</TableCell>
                  <TableCell className="text-xs"><div className="flex flex-col">{Object.entries(r.destinos || {}).map(([k, v]) => <DestinoResultado key={k} nombre={k} valor={v} />)}</div></TableCell>
                  <TableCell className="text-xs text-destructive">{r.error || ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">Todavía no hay backups.</p>}
      </SeccionConfig>
    </div>
  )
}

type Prog = Pick<BackupProgramacion, 'frecuencia' | 'hora' | 'copias'>
const pick = ({ frecuencia, hora, copias }: BackupProgramacion): Prog => ({ frecuencia, hora, copias })

function Programacion({ info, onSaved }: { info: BackupInfo; onSaved: () => void }) {
  // Solo los campos editables: el GET cada 3 s (backup en curso) no ensucia ni pisa la edición
  const original = useMemo(() => ({ config: pick(info.config!), historico: pick(info.historico!) }), [info.config, info.historico])
  const ed = useEdicion<Record<BackupParte, Prog>>(original)
  const v = ed.valor
  const [guardando, correr] = useGuardando()
  const set = (p: BackupParte, patch: Partial<Prog>) => ed.set(cur => ({ ...cur, [p]: { ...cur[p], ...patch } }))
  const guardar = () => correr(() => ed.guardar(async val => {
    try { await backupApi('', 'PUT', val); toast.success('Programación guardada'); onSaved(); return true }
    catch (e: any) { toast.error(e.message); return false }
  }))
  return (
    <SeccionConfig titulo="PROGRAMACIÓN" ayuda="Los backups mensuales anteriores (weg-backup-AAAA-MM) se conservan y no se borran automáticamente.">
      {(['config', 'historico'] as const).map(p => (
        <div key={p} className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem_6rem] items-end">
          <div className="text-sm font-medium pb-2">{PARTE_LABEL[p]}</div>
          <Campo etiqueta="Frecuencia">
            <Select value={v[p].frecuencia} onValueChange={f => set(p, { frecuencia: f as BackupProgramacion['frecuencia'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="diaria">Diaria</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="desactivada">Desactivada</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta="Hora"><Input type="time" aria-label={`Hora ${PARTE_LABEL[p]}`} value={v[p].hora} onChange={e => set(p, { hora: e.target.value })} className="font-mono" /></Campo>
          <Campo etiqueta="Copias"><Input type="number" aria-label={`Copias ${PARTE_LABEL[p]}`} min={1} max={365} value={v[p].copias} onChange={e => set(p, { copias: Math.trunc(+e.target.value) })} className="font-mono" /></Campo>
        </div>
      ))}
      {info.guardado && !(info.guardado.config && info.guardado.historico) && (
        <p className="text-xs text-(--p3-text)">Sin guardar: se usan los valores por defecto al activar un destino.</p>
      )}
      <BarraGuardado sucio={ed.sucio} guardando={guardando} onDescartar={ed.descartar} onGuardar={guardar} />
    </SeccionConfig>
  )
}

function Cifrado({ configurada, onSaved }: { configurada: boolean; onSaved: () => void }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [busy, setBusy] = useState(false)
  const err = a && a.length < 12 ? 'Mínimo 12 caracteres' : b && a !== b ? 'Las frases no coinciden' : ''
  async function save() {
    setBusy(true)
    try {
      const r = await backupApi<{ ok: true; aviso?: string }>('/frase', 'PUT', { frase: a })
      if (r.aviso) toast.warning(r.aviso); else toast.success('Frase guardada')
      setA(''); setB(''); onSaved()
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }
  return (
    <SeccionConfig titulo="CIFRADO"
      acciones={configurada ? <Badge variant="success">Configurada</Badge> : <Badge variant="warning">Sin frase</Badge>}
      ayuda={configurada
        ? 'Para cambiar la frase escribila dos veces. Los backups anteriores siguen necesitando la frase anterior.'
        : 'Los backups se cifran con esta frase antes de salir del equipo. Guardala en un lugar seguro: sin ella no se pueden restaurar.'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Frase"><Input type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} /></Campo>
        <Campo etiqueta="Repetir frase"><Input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} /></Campo>
      </div>
      <div className="flex items-center justify-end gap-3">
        {err && <span className="text-sm text-destructive">{err}</span>}
        <Button size="sm" disabled={busy || !a || !!err || a !== b} onClick={save}><KeyRound className="h-4 w-4" />{configurada ? 'CAMBIAR FRASE' : 'GUARDAR FRASE'}</Button>
      </div>
    </SeccionConfig>

  )
}
