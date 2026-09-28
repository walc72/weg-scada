import { RefreshCw } from 'lucide-react'
import { cn } from '../lib/utils'
import { useNow } from '../lib/useNow'
import { useDrivesStore } from '../store/drives'

// Estado de sincronización de la réplica de oficina (topic weg/replica/status)
export default function ReplicaBadge() {
  const st = useDrivesStore(s => s.replicaStatus)
  const now = useNow(5000)
  const ago = st?.lastSync ? Math.max(0, Math.round((now - st.lastSync) / 1000)) : null
  // Atraso real del histórico (lagSec): tras días apagada, "sincronizado hace 0 s" mentía
  const behind = st?.lagSec != null && st.lagSec > 120
  const ok = !!st && st.live && !st.error && ago !== null && ago < 120 && !behind
  const fmt = (s: number) => (s < 7200 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} días`)
  const text = ago === null
    ? 'Réplica · sin sincronizar'
    : behind
      ? `Réplica · poniéndose al día · atraso ${fmt(st!.lagSec!)}`
      : `Réplica · sincronizado hace ${ago < 60 ? `${ago} s` : `${Math.round(ago / 60)} min`}`
  return (
    <div
      className={cn('hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        ok ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
           : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20')}
      title={st?.error ? `Último error: ${st.error}` : 'Servidor réplica: datos de planta, solo lectura'}
    >
      <RefreshCw className="h-3 w-3" />{text}
    </div>
  )
}
