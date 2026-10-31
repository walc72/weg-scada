// Tendencias → Reguladores (módulo unifilar, spec §6.3): tap (escalonado) y tensión vs consigna.
import { useMemo, useState } from 'react'
import TrendChart from '../components/TrendChart'
import { useConfigStore } from '../store/config'
import { useDrivesStore } from '../store/drives'
import LibresTrend from '../components/LibresTrend'
import Fasorial, { fasorEquipos, porBanco } from '../components/Fasorial'
import { campoChart, type CampoResp } from './RecosTab'

export default function RegsTab({ data, since, until, fetchRange }: {
  data: CampoResp | null
  since: number
  until: number
  fetchRange?: (from: string, to: string, ws: number) => Promise<CampoResp>
}) {
  const regs = (useConfigStore(s => s.config)?.reguladores || []).filter(c => c.enabled !== false)
  const campo = useDrivesStore(s => s.campo)
  const [sel, setSel] = useState('')
  const name = regs.some(r => r.name === sel) ? sel : regs[0]?.name
  const rows = useMemo(() => (data?.campo || []).filter(r => r.kind === 'reg'), [data])
  const mk = (rs: typeof rows, f: string[]) => campoChart(rs, name!, f)
  const tap = useMemo(() => mk(rows, ['tap']).filter(p => (since === 0 || p.ts >= since) && p.ts <= until), [rows, name, since, until])
  const volt = useMemo(() => mk(rows, ['v', 'vConsigna']).filter(p => (since === 0 || p.ts >= since) && p.ts <= until), [rows, name, since, until])

  // fasorial y perfil: el banco del regulador elegido (o los sin banco)
  const grupo = porBanco(regs).find(g => g.regs.some(r => r.name === name))?.regs ?? regs
  const fasor = fasorEquipos(grupo, campo)

  if (regs.length === 0) return <div className="text-center text-muted-foreground text-sm py-10">No hay reguladores configurados.</div>
  if (!data) return <div className="text-center text-muted-foreground text-sm py-10">El histórico de reguladores requiere InfluxDB.</div>
  const rf = (f: string[]) => fetchRange && ((from: string, to: string, ws: number) => fetchRange(from, to, ws).then(d => mk((d.campo || []).filter(r => r.kind === 'reg'), f)))

  return (
    <div className="flex flex-col gap-4">
      <select value={name} onChange={e => setSel(e.target.value)} className="self-start rounded-md border border-border bg-background px-2 py-1 text-sm">
        {porBanco(regs).map(g => g.banco
          ? <optgroup key={g.banco} label={g.banco}>{g.regs.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}</optgroup>
          : g.regs.map(r => <option key={r.name} value={r.name}>{r.name}</option>))}
      </select>
      <TrendChart title={`Posición de tap — ${name}`} data={tap} step unit="" height={220} decimals={0} rangeFetch={rf(['tap'])}
        series={[{ key: 'tap', label: 'Tap', color: '#8b5cf6' }]} />
      <TrendChart title={`Tensión y consigna — ${name} (V)`} data={volt} unit="V" height={240} yDomain={['auto', 'auto']} rangeFetch={rf(['v', 'vConsigna'])}
        series={[{ key: 'v', label: 'Tensión', color: '#0ea5e9' }, { key: 'vConsigna', label: 'Consigna', color: '#f59e0b' }]} />
      <LibresTrend kind="reg" cfgs={grupo} name={name!} data={data} since={since} until={until} fetchRange={fetchRange} />
      {fasor.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Diagrama fasorial</p>
          <Fasorial equipos={fasor} size={320} />
        </div>
      )}
    </div>
  )
}
