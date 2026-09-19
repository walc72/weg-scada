import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Lock, User, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'

export default function Login() {
  const login = useAuthStore(s => s.login)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const userRef = useRef<HTMLInputElement>(null)

  useEffect(() => { userRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    const res = await login(user, pass)
    setLoading(false)
    if (!res.ok) {
      setError(res.error || 'No se pudo iniciar sesión')
      setShake(true)
      setPass('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="h-screen w-screen flex bg-background">
      {/* ── Panel de marca (izquierda) ─────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] max-w-[560px] p-12 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg, #1e3a8a 0%, #2563eb 55%, #0ea5e9 100%)' }}>
        {/* patrón decorativo */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1.5px, transparent 1.5px)', backgroundSize: '28px 28px' }} />
        <div className="relative flex items-center gap-3">
          <img src="/agriplus.png" alt="Agriplus" className="h-11 w-auto bg-white/90 rounded-lg px-3 py-1.5" />
        </div>
        <div className="relative space-y-4">
          <h1 className="text-4xl font-bold leading-tight">Monitoreo de<br />Variadores WEG</h1>
          <p className="text-white/80 text-base max-w-sm">
            Supervisión en tiempo real de drives CFW900 / SSW900 y medición de línea — Agriplus · Agrocaraya · Buey Rodeo.
          </p>
          <div className="flex items-center gap-2 text-white/70 text-sm pt-2">
            <ShieldCheck className="h-4 w-4" />
            Acceso seguro por roles
          </div>
        </div>
        <div className="relative text-white/60 text-xs">
          Powered by <strong className="text-white/80">Tecno Electric S.A.</strong>
        </div>
      </div>

      {/* ── Formulario (derecha) ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* Marca en mobile */}
        <div className="lg:hidden flex flex-col items-center gap-2">
          <img src="/agriplus.png" alt="Agriplus" className="h-14 w-auto" />
          <h1 className="text-xl font-bold tracking-tight">Monitoreo de Drives</h1>
        </div>

        <div className={`w-full max-w-[380px] ${shake ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="bg-primary/10 rounded-2xl p-3.5">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">Ingresá tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuario</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="username"
                  ref={userRef}
                  value={user}
                  onChange={e => { setUser(e.target.value); setError('') }}
                  autoComplete="username"
                  className={`pl-9 ${error ? 'border-destructive' : ''}`}
                  placeholder="usuario"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError('') }}
                  autoComplete="current-password"
                  className={`pl-9 pr-9 ${error ? 'border-destructive' : ''}`}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showPass ? 'Ocultar' : 'Mostrar'}>
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={!user || !pass || loading}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ingresando…</> : 'Ingresar'}
            </Button>
          </form>
        </div>

        <p className="text-xs text-muted-foreground lg:hidden">
          Powered by <strong>Tecno Electric S.A.</strong>
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.45s ease; }
      `}</style>
    </div>
  )
}
