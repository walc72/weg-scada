import { useState, useEffect } from 'react'
import { authFetch, useAuthStore, ROLE_LABEL, type Role } from '../../store/auth'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { SkeletonTabla } from '../../components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select'
import { Plus, Trash2, Pencil, Save, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE, MODE } from './comun'

// ─── Usuarios ─────────────────────────────────────────────────────────
// Lista de usuarios con alta, edición y baja. Reglas (las valida el backend):
// el superadmin no se crea ni se elimina y solo lo edita él mismo; nadie se
// elimina ni se cambia el rol a sí mismo.
type UserInfo = { user: string; role: Role; hasPassword: boolean }
type UserForm = { original: string | null; user: string; role: Role; pw: string; pw2: string }

const ROLE_HELP: Record<string, string> = {
  superadmin: 'Todo, más Marca, Conexión y Réplicas',
  admin: 'Todo, incluida Configuración y usuarios',
  operador: 'Solo lectura: dashboards, tendencias y reportes',
}

export default function UsuariosTab() {
  const me = useAuthStore(s => s.user)
  const myRole = useAuthStore(s => s.role)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<UserForm | null>(null)
  const [saving, setSaving] = useState(false)
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

  async function call(method: string, path: string, body?: unknown) {
    const r = await authFetch(`${API_BASE}/settings/users${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    })
    const data = await r.json().catch(() => null)
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
    return data
  }

  async function load() {
    setLoading(true)
    try {
      if (MODE === 'mock') {
        setUsers([
          { user: 'superadmin', role: 'superadmin', hasPassword: true },
          { user: 'admin', role: 'admin', hasPassword: true },
          { user: 'operador', role: 'operador', hasPassword: true },
        ])
      } else {
        setUsers((await call('GET', '')).users || [])
      }
    } catch (e: any) { toast.error(`No se pudieron cargar los usuarios: ${e.message}`) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const canEdit = (u: UserInfo) => u.role !== 'superadmin' || myRole === 'superadmin'
  const canDelete = (u: UserInfo) => u.role !== 'superadmin' && !same(u.user, me)

  async function save() {
    if (!form) return
    const creating = form.original === null
    if (!form.user.trim()) { toast.error('Falta el nombre de usuario'); return }
    if (creating && !form.pw) { toast.error('Falta la contraseña'); return }
    if (form.pw !== form.pw2) { toast.error('Las contraseñas no coinciden'); return }
    if (MODE === 'mock') {
      setUsers(us => creating ? [...us, { user: form.user.trim(), role: form.role, hasPassword: true }]
        : us.map(u => u.user === form.original ? { ...u, user: form.user.trim(), role: form.role } : u))
      toast.success('Guardado (demo)'); setForm(null); return
    }
    setSaving(true)
    try {
      const body: any = { user: form.user.trim(), role: form.role }
      if (form.pw) body.password = form.pw
      const data = creating ? await call('POST', '', body)
        : await call('PUT', `/${encodeURIComponent(form.original!)}`, body)
      setUsers(data.users || [])
      // Si me renombré, la sesión sigue con el nombre nuevo
      if (!creating && same(form.original!, me) && data.me) useAuthStore.getState().setIdentity(data.me, myRole)
      toast.success(creating ? `Usuario ${body.user} creado` : `Usuario ${body.user} actualizado`)
      setForm(null)
    } catch (e: any) { toast.error(`No se pudo guardar: ${e.message}`) }
    finally { setSaving(false) }
  }

  async function remove(u: UserInfo) {
    if (!confirm(`¿Eliminar el usuario ${u.user}? Se cierran sus sesiones abiertas.`)) return
    if (MODE === 'mock') { setUsers(us => us.filter(x => x.user !== u.user)); return }
    try {
      setUsers((await call('DELETE', `/${encodeURIComponent(u.user)}`)).users || [])
      toast.success(`Usuario ${u.user} eliminado`)
    } catch (e: any) { toast.error(`No se pudo eliminar: ${e.message}`) }
  }

  if (loading) return <SkeletonTabla />

  const editingSelf = !!form && form.original !== null && same(form.original, me)
  const editingSuper = !!form && form.role === 'superadmin'

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start gap-3 bg-card border p-3">
        <div className="text-sm text-muted-foreground flex-1 space-y-0.5">
          {(['superadmin', 'admin', 'operador'] as const).map(r => (
            <div key={r}><strong className="text-foreground">{ROLE_LABEL[r]}</strong>: {ROLE_HELP[r]}.</div>
          ))}
        </div>
        <Button size="sm" onClick={() => setForm({ original: null, user: '', role: 'operador', pw: '', pw2: '' })}>
          <Plus className="h-4 w-4" />Nuevo usuario
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Usuario</TableHead><TableHead>Rol</TableHead><TableHead>Contraseña</TableHead><TableHead className="w-24" /></TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.user}>
                <TableCell className="font-medium">
                  {u.user}{same(u.user, me) && <span className="ml-1.5 text-xs text-muted-foreground">(vos)</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={u.role === 'operador' ? 'secondary' : 'default'} className="uppercase">{ROLE_LABEL[u.role]}</Badge>
                    {u.role === 'superadmin' && <span title="No se puede eliminar; solo lo modifica el superadmin"><Lock className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                  </div>
                </TableCell>
                <TableCell>
                  {u.hasPassword ? <span className="text-xs text-muted-foreground">configurada</span>
                    : <span className="text-xs text-(--p3-text)">sin contraseña</span>}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {canEdit(u) && (
                    <Button variant="ghost" size="icon" title="Editar"
                      onClick={() => setForm({ original: u.user, user: u.user, role: u.role, pw: '', pw2: '' })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete(u) && (
                    <Button variant="ghost" size="icon" title="Eliminar" onClick={() => remove(u)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {users.some(u => u.role === 'superadmin' && !u.hasPassword) && (
        <p className="text-xs text-muted-foreground">
          El superadmin se configura desde la consola del servidor: <code>docker exec -it weg-api node src/cli/superadmin.js</code>
        </p>
      )}

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.original === null ? 'Nuevo usuario' : `Editar ${form?.original}`}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Usuario</Label>
                <Input value={form.user} onChange={e => setForm({ ...form, user: e.target.value })} autoComplete="off" placeholder="p.ej. jperez" />
              </div>
              <div>
                <Label>Rol</Label>
                {editingSuper || editingSelf ? (
                  <div className="text-sm py-2">{ROLE_LABEL[form.role]} <span className="text-xs text-muted-foreground">
                    ({editingSuper ? 'el superadmin no cambia de rol' : 'no podés cambiar tu propio rol'})</span></div>
                ) : (
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operador">Operador — solo lectura</SelectItem>
                      <SelectItem value="admin">Admin — incluye Configuración</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>{form.original === null ? 'Contraseña' : 'Nueva contraseña'}</Label>
                  <Input type="password" value={form.pw} onChange={e => setForm({ ...form, pw: e.target.value })}
                    placeholder={form.original === null ? 'mínimo 4 caracteres' : '(sin cambios)'} autoComplete="new-password" />
                </div>
                <div><Label>Repetir contraseña</Label>
                  <Input type="password" value={form.pw2} onChange={e => setForm({ ...form, pw2: e.target.value })} autoComplete="new-password" />
                </div>
              </div>
              {form.original !== null && !editingSelf && (
                <p className="text-xs text-muted-foreground">Si cambiás el nombre, el rol o la contraseña, se cierran las sesiones abiertas de ese usuario.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              {form?.original === null ? 'Crear' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
