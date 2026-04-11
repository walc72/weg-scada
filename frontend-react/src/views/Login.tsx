import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Lock } from 'lucide-react'

export default function Login() {
  const login = useAuthStore(s => s.login)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const userRef = useRef<HTMLInputElement>(null)

  useEffect(() => { userRef.current?.focus() }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = login(user, pass)
    if (!ok) {
      setError(true)
      setShake(true)
      setPass('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background gap-6">
      {/* Logo / branding */}
      <div className="flex flex-col items-center gap-2">
        <img src="/agriplus.png" alt="Agriplus" className="h-16 w-auto" />
        <h1 className="text-2xl font-bold tracking-tight">Monitoreo de Drives</h1>
        <p className="text-sm text-muted-foreground">Tecno Electric S.A.</p>
      </div>

      <Card
        className={`w-[360px] p-8 space-y-5 transition-transform ${shake ? 'animate-shake' : ''}`}
      >
        <div className="flex flex-col items-center gap-2 pb-1">
          <div className="bg-primary/10 rounded-full p-3">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Iniciar sesión</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              ref={userRef}
              value={user}
              onChange={e => { setUser(e.target.value); setError(false) }}
              autoComplete="username"
              className={error ? 'border-destructive' : ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={pass}
              onChange={e => { setPass(e.target.value); setError(false) }}
              autoComplete="current-password"
              className={error ? 'border-destructive' : ''}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm text-center">Usuario o contraseña incorrectos</p>
          )}

          <Button type="submit" className="w-full" disabled={!user || !pass}>
            Ingresar
          </Button>
        </form>
      </Card>

      <p className="text-xs text-muted-foreground">
        Powered by <strong>Tecno Electric S.A.</strong>
      </p>

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
