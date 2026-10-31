import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDrivesStore } from '../store/drives'
import { useConfigStore } from '../store/config'
import { useAuthStore, isAdminRole } from '../store/auth'
import { useLicense } from '../store/license'
import { Chip } from '../components/CampoBase'
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

const fmtHora = (ms?: number) => ms ? new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'
const fmtUptime = (s?: number | null) => s == null ? '—' : `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
const fmtNum = (v: number | null | undefined, u = '', d = 0) => v == null ? '—' : `${v.toFixed(d)}${u}`

// Escala −95…−55 dBm. ISA-101: gris si es aceptable (≥ −75), amarillo si es débil.
// La banda marca el rango bueno (≥ −65).
const pctDbm = (dbm: number) => Math.max(0, Math.min(100, ((dbm + 95) / 40) * 100))
function SignalBar({ dbm }: { dbm?: number | null }) {
  if (dbm == null) return <div className="text-[11px] tracking-widest text-muted-foreground">SEÑAL —</div>
  const debil = dbm < -75
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] tracking-widest text-muted-foreground">SEÑAL{debil && <span className="ml-1.5 font-bold" style={{ color: 'var(--p3-text)' }}>DÉBIL</span>}</span>
        <span className="font-mono text-sm tabular-nums">{dbm} <span className="text-[11px] text-muted-foreground">dBm</span></span>
      </div>
      <div className="relative h-2.5" style={{ background: 'var(--bar-track)' }}>
        <div className="absolute inset-y-0" style={{ left: `${pctDbm(-65)}%`, right: 0, background: 'var(--bar-band)' }} />
        <div className="absolute inset-y-0 left-0" style={{ width: `${pctDbm(dbm)}%`, background: debil ? 'var(--p3)' : 'var(--bar-fill)' }} />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-0.5"><span>−95</span><span>buena ≥ −65</span><span>−55</span></div>
    </div>
  )
}

const Dato = ({ k, v }: { k: string; v: string | number }) => (
  <div><div className="text-[11px] tracking-wider text-muted-foreground">{k}</div><div className="font-mono text-sm tabular-nums">{v}</div></div>
)

const par = (a?: number | null, b?: number | null, d = 0) => `${fmtNum(a, '', d)} / ${fmtNum(b, '', d)}`

// Extremo del enlace airMAX (local o remoto)
function Extremo({ lado, nombre, ip, signal, noise, right }: {
  lado: string; nombre?: string | null; ip?: string | null; signal?: number | null; noise?: number | null; right?: boolean
}) {
  return (
    <div className={cn('border p-3 space-y-2', right && 'md:text-right')}>
      <div className={cn('flex items-center gap-1 text-[11px] tracking-widest text-muted-foreground', right && 'md:justify-end')}>
        <RadioTower className="h-3.5 w-3.5" />{lado.toUpperCase()}
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
    const m = new Map<string, { name: string; label: string; online: boolean }[]>()
    if (!config) return m
    const add = (items: Item[], kind: Kind, online: (n: string) => boolean, label: (n: string) => string | undefined = () => undefined) => {
      for (const it of items) {
        if (it.enabled === false) continue
        const l = linkOf(it, kind, config)
        if (l) m.set(l, [...(m.get(l) ?? []), { name: it.name, label: label(it.name) || it.name, online: online(it.name) }])
      }
    }
    // Mismo nombre visible que el Dashboard
    const meterNames = (config as any).meterNames as Record<string, string> | undefined
    add(config.devices, 'drive', n => !!drives.get(n)?.online, n => drives.get(n)?.displayName)
    add(config.meters, 'meter', n => !!meters.get(n)?.online,
      n => (config.meters.find(x => x.name === n) as any)?.ui?.title || meterNames?.[n])
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

  // Los dos extremos de un enlace cargados: una sola tarjeta (la primera en la lista).
  // El otro extremo ya se ve como «Remoto»; sus equipos se suman a la tarjeta visible.
  const remotoDe = new Map<string, string>() // IP del remoto → tarjeta que lo muestra
  const unido = new Map<string, string>()    // extremo oculto → tarjeta visible
  for (const c of lista) {
    const dueno = remotoDe.get(c.ip)
    if (dueno) { unido.set(c.name, dueno); continue }
    const s = comms.get(c.name)
    if (s?.online && s.remotoIp) remotoDe.set(s.remotoIp, c.name)
  }

  const visibles = lista.filter(c => !unido.has(c.name))
  const caidos = visibles.filter(c => comms.get(c.name) && !comms.get(c.name)!.online).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xs font-bold tracking-widest">COMUNICACIONES</h1>
        <span className="text-[11px] font-mono text-muted-foreground">{visibles.length - caidos} / {visibles.length} EN LÍNEA</span>
        {caidos > 0 && <Chip tono="com">{caidos} SIN COMUNICACIÓN</Chip>}
      </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visibles.map(c => {
        const s: CommState | undefined = comms.get(c.name)
        const eq = [c.name, ...[...unido].filter(([, v]) => v === c.name).map(([k]) => k)].flatMap(n => detras.get(n) ?? [])
        const caido = !!s && !s.online
        return (
          <section key={c.name} aria-label={c.name} className={cn('bg-card border p-4 space-y-3', c.tipo === 'airmax' && 'md:col-span-2 xl:col-span-3')}
            style={caido ? { borderColor: 'var(--st-com)', borderStyle: 'dashed' } : undefined}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-bold tracking-wide">{c.name}</h2>
                <div className="text-[11px] font-mono text-muted-foreground uppercase">{c.tipo === 'airmax' ? 'airMAX' : 'RUT'} · {c.ip}</div>
              </div>
              {s?.license === 'excedido'
                ? <Chip tono="off">FUERA DE LICENCIA</Chip>
                : s
                ? (s.online ? <Chip tono="off">EN LÍNEA</Chip> : <Chip tono="com">SIN COMUNICACIÓN · {fmtHora(s.desde)}</Chip>)
                : <Chip tono="off">ESPERANDO LECTURA</Chip>}
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
            <div className="border-t pt-2">
              <div className="text-[11px] tracking-widest text-muted-foreground mb-1.5">EQUIPOS POR ESTE ENLACE</div>
              {eq.length ? (
                <div className="flex flex-wrap gap-1">
                  {eq.map(e => (
                    <span key={e.name} className="inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-xs" title={e.label !== e.name ? `ID: ${e.name}` : undefined}
                      style={e.online ? undefined : { borderColor: 'var(--st-com)', borderStyle: 'dashed', color: 'var(--st-com)' }}>
                      <span className="h-1.5 w-1.5" style={{ background: e.online ? 'hsl(var(--foreground))' : 'transparent', border: e.online ? undefined : '1px solid var(--st-com)' }} />{e.label}
                    </span>
                  ))}
                </div>
              ) : <div className="text-xs text-muted-foreground">Ninguno (se asignan con «Conectado por» en cada equipo)</div>}
            </div>
          </section>
        )
      })}
    </div>
    </div>
  )
}
