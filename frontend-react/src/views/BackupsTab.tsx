// Configuración → Backups (spec backup externo §6): estado, programación, cifrado, destinos e historial.
import { useEffect, useState } from 'react'
import { useBackup, backupApi } from '../store/backup'
import type { BackupInfo, BackupParte, BackupProgramacion, BackupRun } from '../types'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table'
import { Loader2, Play, Save, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import BackupDestinos from './BackupDestinos'

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
  if (valor === 'ok') return <span className="text-green-600 dark:text-green-400">✓ {label}</span>
  if (valor === 'omitido') return <span className="text-muted-foreground">– {label} (omitido)</span>
  return <span className="text-destructive">✗ {label}: {valor.replace(/^error\s*/, '')}</span>
}

export default function BackupsTab() {
  const info = useBackup(s => s.info)
  const load = useBackup(s => s.load)
  const [pedido, setPedido] = useState(0) // polls restantes tras "Hacer backup ahora" hasta que weg-backup lo tome

  // Los formularios toman sus valores al montar: se espera un GET propio (el del aviso de la App puede ser viejo)
  const [fresco, setFresco] = useState(false)
  useEffect(() => { load().finally(() => setFresco(true)) }, [])
  const enCurso = info?.estado?.enCurso
  // Avance: GET cada 3 s mientras corre (o mientras se espera que arranque el pedido)
  useEffect(() => {
    if (!enCurso && !pedido) return
    const t = setInterval(() => { load(); setPedido(p => (p > 0 ? p - 1 : 0)) }, 3000)
    return () => clearInterval(t)
  }, [!!enCurso, !!pedido])
  useEffect(() => { if (enCurso) setPedido(0) }, [!!enCurso])

  if (!fresco) return <div className="text-sm text-muted-foreground py-8 text-center">Cargando…</div>
  if (!info) return <div className="text-sm text-destructive py-8 text-center">No se pudo cargar la configuración de backup.</div>
  if (!info.modulo) return <div className="text-sm text-muted-foreground py-8 text-center">La licencia no incluye el módulo backup.</div>

  async function ahora(partes: BackupParte[]) {
    try { await backupApi('/ahora', 'POST', { partes }); toast.success('Backup pedido'); setPedido(10); load() }
    catch (e: any) { toast.error(e.message) }
  }

  const estado = info.estado
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Estado */}
      <section className="space-y-2">
        <h3 className="font-semibold">Estado</h3>
        <Card className="p-4 space-y-4">
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
                <span className="text-sm text-muted-foreground mr-1">Hacer backup ahora</span>
                <Button size="sm" variant="outline" disabled={!!pedido} onClick={() => ahora(['config'])}><Play className="h-3.5 w-3.5 mr-1" />Configuración</Button>
                <Button size="sm" variant="outline" disabled={!!pedido} onClick={() => ahora(['historico'])}><Play className="h-3.5 w-3.5 mr-1" />Histórico</Button>
                <Button size="sm" variant="outline" disabled={!!pedido} onClick={() => ahora(['config', 'historico'])}><Play className="h-3.5 w-3.5 mr-1" />Todo</Button>
                {!!pedido && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </>
            )}
          </div>
        </Card>
      </section>

      <Programacion info={info} onSaved={load} />
      <Cifrado configurada={!!info.fraseConfigurada} onSaved={load} />
      <BackupDestinos info={info} reload={load} />

      {/* Historial */}
      <section className="space-y-2">
        <h3 className="font-semibold">Historial</h3>
        <Card className="overflow-x-auto">
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
          ) : <div className="p-6 text-sm text-muted-foreground text-center">Todavía no hay backups.</div>}
        </Card>
      </section>
    </div>
  )
}

function Programacion({ info, onSaved }: { info: BackupInfo; onSaved: () => void }) {
  const [v, setV] = useState<Record<BackupParte, BackupProgramacion>>({ config: info.config!, historico: info.historico! })
  const [busy, setBusy] = useState(false)
  const set = (p: BackupParte, patch: Partial<BackupProgramacion>) => setV(cur => ({ ...cur, [p]: { ...cur[p], ...patch } }))
  async function save() {
    setBusy(true)
    const pick = ({ frecuencia, hora, copias }: BackupProgramacion) => ({ frecuencia, hora, copias })
    try { await backupApi('', 'PUT', { config: pick(v.config), historico: pick(v.historico) }); toast.success('Programación guardada'); onSaved() }
    catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Programación</h3>
      <Card className="p-4 space-y-3">
        {(['config', 'historico'] as const).map(p => (
          <div key={p} className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem_6rem] items-end">
            <div className="text-sm font-medium pb-2">{PARTE_LABEL[p]}</div>
            <div><Label>Frecuencia</Label>
              <Select value={v[p].frecuencia} onValueChange={f => set(p, { frecuencia: f as BackupProgramacion['frecuencia'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diaria</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="desactivada">Desactivada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Hora</Label><Input type="time" value={v[p].hora} onChange={e => set(p, { hora: e.target.value })} /></div>
            <div><Label>Copias</Label><Input type="number" min={1} max={365} value={v[p].copias} onChange={e => set(p, { copias: Math.trunc(+e.target.value) })} /></div>
          </div>
        ))}
        <div className="flex justify-end"><Button size="sm" disabled={busy} onClick={save}><Save className="h-3.5 w-3.5 mr-1" />Guardar</Button></div>
      </Card>
    </section>
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
    <section className="space-y-2">
      <h3 className="font-semibold flex items-center gap-2">Cifrado {configurada ? <Badge variant="success">Configurada</Badge> : <Badge variant="warning">Sin frase</Badge>}</h3>
      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {configurada
            ? 'Para cambiar la frase escribila dos veces. Los backups anteriores siguen necesitando la frase anterior.'
            : 'Los backups se cifran con esta frase antes de salir del equipo. Guardala en un lugar seguro: sin ella no se pueden restaurar.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Frase</Label><Input type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} /></div>
          <div><Label>Repetir frase</Label><Input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-end gap-3">
          {err && <span className="text-sm text-destructive">{err}</span>}
          <Button size="sm" disabled={busy || !a || !!err || a !== b} onClick={save}><KeyRound className="h-3.5 w-3.5 mr-1" />{configurada ? 'Cambiar frase' : 'Guardar frase'}</Button>
        </div>
      </Card>
    </section>
  )
}
