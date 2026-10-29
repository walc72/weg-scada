import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDrivesStore } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useAuthStore, isAdminRole } from '../store/auth'
import { useLicense } from '../store/license'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { ArrowLeft, ArrowRight, RadioTower } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppConfig, CommState } from '../types'

type Kind = 'drive' | 'meter' | 'flowmeter'
type Item = { name: string; enlace?: string; gateway?: string; enabled?: boolean }

// Misma regla de herencia que el poller: equipo con gateway → enlace del gateway;
// sin gateway, medidor y caudalímetro → enlace propio. Un nombre que no está en config.comms = sin enlace.
function linkOf(item: Item, kind: Kind, cfg: AppConfig): string | undefined {
  const raw = kind === 'drive' && item.gateway
    ? cfg.gateways.find(g => g.name === item.gateway)?.enlace
    : item.enlace
  return raw && (cfg.comms ?? []).some(c => c.name === raw) ? raw : undefined
}

const fmtHora = (ms?: number) => ms ? new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '--:--'
const fmtUptime = (s?: number | null) => s == null ? '—' : `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
const fmtNum = (v: number | null | undefined, u = '', d = 0) => v == null ? '—' : `${v.toFixed(d)}${u}`

// Buena ≥ −65 dBm, regular −65 a −75, débil < −75
function SignalBar({ dbm }: { dbm?: number | null }) {
  if (dbm == null) return <div className="text-sm text-muted-foreground">Señal —</div>
  const tone = dbm >= -65 ? 'bg-emerald-500' : dbm >= -75 ? 'bg-amber-500' : 'bg-red-500'
  const pct = Math.max(0, Math.min(100, ((dbm + 95) / 40) * 100))
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Señal</span><span className="font-mono">{dbm} dBm</span></div>
      <div className="h-2 rounded bg-muted overflow-hidden"><div className={cn('h-full', tone)} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

const Dato = ({ k, v }: { k: string; v: string | number }) => (
  <div><div className="text-xs text-muted-foreground">{k}</div><div className="font-mono text-sm">{v}</div></div>
)

const par = (a?: number | null, b?: number | null, d = 0) => `${fmtNum(a, '', d)} / ${fmtNum(b, '', d)}`

// Extremo del enlace airMAX (local o remoto)
function Extremo({ lado, nombre, ip, signal, noise, right }: {
  lado: string; nombre?: string | null; ip?: string | null; signal?: number | null; noise?: number | null; right?: boolean
}) {
  return (
    <div className={cn('rounded-md border p-3 space-y-2', right && 'md:text-right')}>
      <div className={cn('flex items-center gap-1 text-xs text-muted-foreground', right && 'md:justify-end')}>
        <RadioTower className="h-3.5 w-3.5" />{lado}
      </div>
      <div>
        <div className="font-semibold text-sm">{nombre ?? '—'}</div>
        <div className="text-xs text-muted-foreground font-mono">{ip ?? '—'}</div>
      </div>
      <SignalBar dbm={signal} />
      <div className="text-xs text-muted-foreground">Ruido <span className="font-mono">{fmtNum(noise, ' dBm')}</span></div>
    </div>
  )
}

// Enlace punto a punto: local ↔ remoto, con distancia, canal y velocidades al medio
function EnlaceAirmax({ c, s }: { c: { name: string; ip: string }; s: CommState }) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1fr] md:items-center">
      <Extremo lado="Local" nombre={c.name} ip={c.ip} signal={s.signal} noise={s.noise} />
      <div className="space-y-2 text-center">
        <div className="text-xs text-muted-foreground">
          {s.remoto ? <>SSID <span className="font-medium text-foreground">{s.remoto}</span> · </> : null}
          {fmtNum(s.freqMhz, ' MHz')} · {fmtNum(s.anchoMhz, ' MHz')}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <div className="flex-1 border-t border-dashed" />
          <span className="text-lg font-semibold font-mono text-foreground">
            {s.distanciaM == null ? '—' : `${(s.distanciaM / 1000).toFixed(1)} km`}
          </span>
          <div className="flex-1 border-t border-dashed" />
          <ArrowRight className="h-4 w-4 shrink-0" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-left">
          <Dato k="Tasa TX/RX (Mbps)" v={par(s.txMbps, s.rxMbps)} />
          <Dato k="Capacidad (Mbps)" v={par(s.capTxMbps, s.capRxMbps, 1)} />
          <Dato k="Tráfico ↑/↓ (Mbps)" v={par(s.trafTxMbps, s.trafRxMbps, 2)} />
        </div>
        <div className="text-xs text-muted-foreground">CCQ {fmtNum(s.quality, ' %')} · Uptime {fmtUptime(s.uptime)}</div>
      </div>
      <Extremo lado="Remoto" nombre={s.remotoNombre} ip={s.remotoIp} signal={s.remotoSignal} noise={s.remotoNoise} right />
    </div>
  )
}

export default function Comunicaciones() {
  const hasModule = useLicense(s => s.hasModule('comunicaciones'))
  const config = useConfigStore(s => s.config)
  const comms = useDrivesStore(s => s.comms)
  const drives = useDrivesStore(s => s.drives)
  const meters = useDrivesStore(s => s.meters)
  const flowmeters = useDrivesStore(s => s.flowmeters)
  const isAdmin = isAdminRole(useAuthStore(s => s.role))

  // enlace → equipos detrás, con su estado online
  const detras = useMemo(() => {
    const m = new Map<string, { name: string; online: boolean }[]>()
    if (!config) return m
    const add = (items: Item[], kind: Kind, online: (n: string) => boolean) => {
      for (const it of items) {
        if (it.enabled === false) continue
        const l = linkOf(it, kind, config)
        if (l) m.set(l, [...(m.get(l) ?? []), { name: it.name, online: online(it.name) }])
      }
    }
    add(config.devices, 'drive', n => !!drives.get(n)?.online)
    add(config.meters, 'meter', n => !!meters.get(n)?.online)
    add(config.flowmeters ?? [], 'flowmeter', n => !!flowmeters.get(n)?.online)
    return m
  }, [config, drives, meters, flowmeters])

  if (!hasModule) return <div className="py-16 text-center text-sm text-muted-foreground">Módulo no incluido en la licencia.</div>
  const lista = (config?.comms ?? []).filter(c => c.enabled !== false)
  if (!lista.length) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No hay equipos de comunicación.{' '}
        {isAdmin ? <>Cargalos en <Link to="/config" className="underline">Configuración → Dispositivos</Link>.</> : 'Cargalos en Configuración → Dispositivos.'}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {lista.map(c => {
        const s: CommState | undefined = comms.get(c.name)
        const eq = detras.get(c.name) ?? []
        return (
          <Card key={c.name} className={cn('p-4 space-y-3', c.tipo === 'airmax' && 'md:col-span-2 xl:col-span-3')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.tipo === 'airmax' ? 'airMAX' : 'RUT'} · {c.ip}</div>
              </div>
              {s?.license === 'excedido'
                ? <Badge variant="outline">Fuera de licencia</Badge>
                : s
                ? <Badge className={s.online ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}>{s.online ? 'En línea' : `Caído desde ${fmtHora(s.desde)}`}</Badge>
                : <Badge variant="outline">Esperando lectura</Badge>}
            </div>
            {c.enlace && <div className="text-xs text-muted-foreground">Depende de {c.enlace}</div>}
            {s?.online && s.license !== 'excedido' && c.tipo === 'airmax' && <EnlaceAirmax c={c} s={s} />}
            {s?.online && s.license !== 'excedido' && c.tipo !== 'airmax' && (
              <>
                <SignalBar dbm={s.signal} />
                <div className="grid grid-cols-3 gap-2">
                  <Dato k="Operador" v={s.operador ?? '—'} />
                  <Dato k="Red" v={s.red ?? '—'} />
                  <Dato k="Uptime" v={fmtUptime(s.uptime)} />
                </div>
              </>
            )}
            <div>
              <div className="text-xs font-medium mb-1">Equipos detrás</div>
              {eq.length ? (
                <div className="flex flex-wrap gap-1">
                  {eq.map(e => (
                    <Badge key={e.name} variant="outline" className="gap-1">
                      <span className={cn('h-1.5 w-1.5 rounded-full', e.online ? 'bg-emerald-500' : 'bg-slate-400')} />{e.name}
                    </Badge>
                  ))}
                </div>
              ) : <div className="text-xs text-muted-foreground">Ninguno</div>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
