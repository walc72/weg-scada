import { RefreshCw } from 'lucide-react'
import { cn } from '../lib/utils'
import { useNow } from '../lib/useNow'
import { useDrivesStore } from '../store/drives'

// Estado de sincronización de la réplica de oficina (topic weg/replica/status)
export default function ReplicaBadge() {
  const st = useDrivesStore(s => s.replicaStatus)
  const now = useNow(5000)
  const ago = st?.lastSync ? Math.max(0, Math.round((now - st.lastSync) / 1000)) : null
  const ok = !!st && st.live && !st.error && ago !== null && ago < 120
  const text = ago === null
    ? 'Réplica · sin sincronizar'
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
