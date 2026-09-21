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
      {/* ── Panel de marca (izquierda, siempre oscuro "control room") ── */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] max-w-[600px] p-14 relative overflow-hidden"
        style={{ background: '#0E1116', color: '#E7ECF3', borderRight: '1px solid #222833' }}>
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }} />
        <div className="relative self-start bg-white rounded-2xl px-6 py-4">
          <img src="/agriplus.png" alt="Agriplus" className="h-14 w-auto block" />
        </div>
        <div className="relative space-y-5">
          <div className="text-sm tracking-[0.18em]" style={{ color: '#F0812F' }}>SISTEMA DE MONITOREO</div>
          <h1 className="text-6xl font-semibold leading-[1.08]">Planta de Bombeo</h1>
          <p className="text-xl leading-relaxed max-w-[480px]" style={{ color: '#8B97A9' }}>
            Supervisión en tiempo real de drives CFW900 / SSW900 y medición eléctrica.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-sm" style={{ color: '#5D6675' }}>
          <ShieldCheck className="h-4 w-4" />
          Acceso seguro por roles · Powered by <strong style={{ color: '#8B97A9' }}>Tecno Electric S.A.</strong>
        </div>
      </div>

      {/* ── Formulario (derecha) ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* Marca en mobile */}
        <div className="lg:hidden flex flex-col items-center gap-2">
          <img src="/agriplus.png" alt="Agriplus" className="h-16 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">Planta de Bombeo</h1>
        </div>

        <div className={`w-full max-w-[420px] ${shake ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-center gap-2.5 mb-8">
            <div className="bg-primary/10 rounded-2xl p-4">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">Ingresá tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm">Usuario</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="username"
                  ref={userRef}
                  value={user}
                  onChange={e => { setUser(e.target.value); setError('') }}
                  autoComplete="username"
                  className={`h-12 text-base pl-10 ${error ? 'border-destructive' : ''}`}
                  placeholder="usuario"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError('') }}
                  autoComplete="current-password"
                  className={`h-12 text-base pl-10 pr-10 ${error ? 'border-destructive' : ''}`}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showPass ? 'Ocultar' : 'Mostrar'}>
                  {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}

            <Button type="submit" className="w-full h-12 text-base" disabled={!user || !pass || loading}>
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
