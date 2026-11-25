import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { apiJson } from '../lib/api'
import { useConfigStore } from '../store/config'
import { useAuthStore, isAdminRole } from '../store/auth'
import { Chip } from './CampoBase'
import { Button } from './ui/button'
import { ConfirmarDialog } from './ui/confirmar-dialog'

// Diagnóstico del perro guardián del bus serie (Modbus RTU) de cada PLC
// (Vigilancia_Serial en el M241) y reinicio a pedido, solo para admin.
export type DiagSerie = {
  gateway: string
  disponible: boolean
  error?: string
  reinicios?: number
  sinRefrescar?: number[]
  paso?: number
  motivoUltimo?: 'automatico' | 'portal' | null
  seguidos?: number
  minDesdeUltimo?: number | null
}

const CADA_MS = 5000

export function fmtUltimo(d: DiagSerie): string {
  if (d.minDesdeUltimo == null) return 'Nunca'
  const t = d.minDesdeUltimo < 60 ? `hace ${d.minDesdeUltimo} min` : `hace ${Math.floor(d.minDesdeUltimo / 60)} h`
  return `${t}${d.motivoUltimo ? ` · ${d.motivoUltimo === 'portal' ? 'desde el portal' : 'automático'}` : ''}`
}

export default function BusSerie() {
  const [lista, setLista] = useState<DiagSerie[]>([])
  const [pedir, setPedir] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ gw: string; ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const config = useConfigStore(s => s.config)
  const isAdmin = isAdminRole(useAuthStore(s => s.role))

  useEffect(() => {
    let vivo = true
    const leer = () => {
      if (document.hidden) return
      apiJson<DiagSerie[]>('/serie').then(l => { if (vivo) setLista(l) }).catch(() => {})
    }
    leer()
    const t = setInterval(leer, CADA_MS)
    document.addEventListener('visibilitychange', leer)
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', leer) }
  }, [])

  const visibles = lista.filter(d => d.disponible)
  if (!visibles.length) return null

  const nombreEsclavo = (gw: string, i: number) =>
    config?.devices.find(d => d.gateway === gw && d.slot === i + 1)?.name ?? `Esclavo ${i + 1}`

  async function reiniciar(gw: string) {
    setPedir(null)
    setEnviando(true)
    try {
      const r = await apiJson<{ ok: boolean; error?: string; espera?: number }>(`/serie/${encodeURIComponent(gw)}/reiniciar`, { method: 'POST' })
      setAviso({ gw, ok: r.ok, texto: r.ok ? 'Reinicio aceptado: el bus se detiene 3 s y vuelve a leer.' : `${r.error}${r.espera ? ` (probá en ${r.espera} s)` : ''}` })
    } catch (e: any) {
      setAviso({ gw, ok: false, texto: e.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      {visibles.map(d => {
        const trabados = (d.sinRefrescar ?? []).filter(s => s > 0).length
        return (
          <section key={d.gateway} aria-label={`Bus serie ${d.gateway}`} className="bg-card border p-4 space-y-3"
            style={trabados ? { borderColor: 'var(--st-com)', borderStyle: 'dashed' } : undefined}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-[15px] font-bold tracking-wide">Bus serie · {d.gateway}</h2>
                <div className="text-[11px] font-mono text-muted-foreground uppercase">Modbus RTU · perro guardián del PLC</div>
              </div>
              {d.paso ? <Chip tono="p3">REINICIANDO</Chip>
                : trabados ? <Chip tono="com">{trabados} SIN REFRESCAR</Chip>
                : <Chip tono="off">REFRESCANDO</Chip>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(d.sinRefrescar ?? []).map((s, i) => (
                <div key={i}>
                  <div className="text-[11px] tracking-wider text-muted-foreground">{nombreEsclavo(d.gateway, i)}</div>
                  <div className={`font-mono text-sm tabular-nums ${s > 0 ? 'font-bold' : ''}`}>
                    {s > 0 ? `${s >= 60 ? '≥60' : s} s sin dato` : 'OK'}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t pt-2">
              <div><div className="text-[11px] tracking-wider text-muted-foreground">Reinicios</div><div className="font-mono text-sm tabular-nums">{d.reinicios ?? 0}</div></div>
              <div><div className="text-[11px] tracking-wider text-muted-foreground">Último</div><div className="font-mono text-sm">{fmtUltimo(d)}</div></div>
            </div>
            {aviso?.gw === d.gateway && (
              <div role="status" className="text-xs" style={{ color: aviso.ok ? undefined : 'var(--p3-text)' }}>{aviso.texto}</div>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" disabled={enviando || !!d.paso} onClick={() => { setAviso(null); setPedir(d.gateway) }}>
                <RotateCcw className="size-3.5" /> Reiniciar comunicación serie
              </Button>
            )}
          </section>
        )
      })}
      <ConfirmarDialog
        open={!!pedir}
        titulo="Reiniciar comunicación serie"
        mensaje={<>El PLC detiene el bus Modbus RTU 3 s y lo vuelve a arrancar. Mientras tanto no llegan datos de los arrancadores de <b>{pedir}</b>. No arranca ni para motores.</>}
        textoConfirmar="Reiniciar"
        onConfirmar={() => pedir && reiniciar(pedir)}
        onCancelar={() => setPedir(null)}
      />
    </>
  )
}
