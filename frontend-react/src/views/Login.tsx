import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { useBrandingStore } from '../store/branding'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { FirmaIngreso } from '../components/FirmaHecian'
import { Lock, User, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'

// Texto secundario sobre el negro mate del panel: blanco frío atenuado (contraste ≥ 4,5:1)
const TEXTO_2_PANEL = 'color-mix(in srgb, var(--hlc-blanco-frio) 62%, var(--hlc-negro-mate))'

export default function Login() {
  const login = useAuthStore(s => s.login)
  const { name, subtitle, logoUrl, footer } = useBrandingStore()
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
      {/* ── Panel del cliente (izquierda, siempre en negro mate de la marca HECIAN LC, colores de src/marca/colores.css) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] max-w-[600px] p-14 relative overflow-hidden"
        style={{ background: 'var(--hlc-negro-mate)', color: 'var(--hlc-blanco-frio)', borderRight: '1px solid var(--hlc-carbon)' }}>
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, var(--hlc-blanco-frio) 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }} />
        <div className="relative self-start bg-white px-6 py-4">
          <img src={logoUrl} alt={name} className="h-14 w-auto max-w-[360px] object-contain block" />
        </div>
        <div className="relative space-y-5">
          <div className="font-titulo text-base font-semibold tracking-[0.18em]" style={{ color: 'var(--hlc-cian)' }}>SISTEMA DE MONITOREO</div>
          <h1 className="text-6xl font-semibold leading-[1.08] wrap-break-word">{name}</h1>
          {subtitle && (
            <p className="text-xl leading-relaxed max-w-[480px]" style={{ color: TEXTO_2_PANEL }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="relative flex items-center gap-2 text-sm" style={{ color: TEXTO_2_PANEL }}>
          <ShieldCheck className="h-4 w-4" />
          Acceso seguro por roles{footer && <> · Powered by <strong style={{ color: 'var(--hlc-blanco-frio)' }}>{footer}</strong></>}
        </div>
      </div>

      {/* ── Formulario (derecha) ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* Marca en mobile */}
        <div className="lg:hidden flex flex-col items-center gap-2">
          <img src={logoUrl} alt={name} className="h-16 w-auto max-w-[280px] object-contain" />
          <h1 className="text-2xl font-semibold tracking-tight text-center">{name}</h1>
        </div>

        <div className={`w-full max-w-[420px] ${shake ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-start gap-1.5 mb-6 border-b pb-4">
            <h2 className="text-sm font-bold tracking-widest">INICIAR SESIÓN</h2>
            <p className="text-sm text-muted-foreground">Ingresá tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[11px] tracking-widest text-muted-foreground">USUARIO O CORREO</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="username"
                  ref={userRef}
                  value={user}
                  onChange={e => { setUser(e.target.value); setError('') }}
                  autoComplete="username"
                  className={`h-12 text-base pl-10 ${error ? 'border-destructive' : ''}`}
                  placeholder="usuario o correo"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[11px] tracking-widest text-muted-foreground">CONTRASEÑA</Label>
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
              <p role="alert" className="border bg-card px-3 py-2 text-sm" style={{ borderColor: 'var(--p1)', boxShadow: 'inset 4px 0 0 var(--p1)', color: 'var(--p1-text)' }}>{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full text-sm tracking-widest" disabled={!user || !pass || loading}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ingresando…</> : 'INGRESAR'}
            </Button>
          </form>
        </div>

        {footer && <p className="text-xs text-muted-foreground lg:hidden">
          Powered by <strong>{footer}</strong>
        </p>}
        {/* Firma HECIAN LC debajo del formulario (marca v0.2.0): SVG en curvas, 140 px de ancho como mínimo */}
        <FirmaIngreso className="mt-2" />
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
