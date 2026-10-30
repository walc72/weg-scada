import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { puntosLibres } from '../CampoBase'
import { fasesDeBanco } from '../../lib/energizar'
import { acotar, alternarMostrar, tieneMostrar } from '../../lib/unifilarEditor'
import type { Dibujo, Lado, Nodo, Rot, Vinculo } from '../../lib/unifilar'
import { bornes, ladoPorDefecto } from '../../lib/bornes'
import type { AppConfig, CampoConfig } from '../../types'
import { FIJAS } from './Mediciones'

const inp = 'w-full rounded border bg-background px-2 py-1 text-sm'

function Fila({ t, children }: { t: string; children: ReactNode }) {
  return <label className="mb-2 block"><span className="mb-0.5 block text-xs text-muted-foreground">{t}</span>{children}</label>
}

// Número con texto intermedio: confirma solo valores válidos, así se puede borrar y reescribir
// Se escribe libre; al salir del campo o con Enter se ajusta (límites y grilla `step`) y recién ahí se confirma; Esc vuelve atrás
function Num({ value, onChange, min, max, step }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const orig = value == null ? '' : String(value)
  const [t, setT] = useState(orig)
  useEffect(() => { setT(orig) }, [orig])
  const confirmar = () => {
    const v = acotar(t, min, max, step)
    if (v == null) setT(orig)
    else { setT(String(v)); if (v !== value) onChange(v) }
  }
  return <input className={inp} type="number" value={t} min={min} max={max} step={step}
    onChange={e => setT(e.target.value)} onBlur={confirmar}
    onKeyDown={e => { if (e.key === 'Enter') confirmar(); else if (e.key === 'Escape') setT(orig) }} />
}

const nombres = (l?: { name: string }[]) => (l ?? []).map(x => x.name)
const bancosDe = (c: AppConfig) => [...new Set((c.reguladores ?? []).filter(r => r.banco && r.enabled !== false).map(r => r.banco!))]

// Selector de regulador suelto o banco: valor `r:NOMBRE` / `b:NOMBRE`
function SelReg({ valor, cfg, onChange }: { valor: string; cfg: AppConfig; onChange: (v: string) => void }) {
  const bancos = bancosDe(cfg)
  const sueltos = nombres(cfg.reguladores)
  const hay = valor === '' || (valor[0] === 'b' ? bancos : sueltos).includes(valor.slice(2))
  return (
    <select className={inp} value={valor} onChange={e => onChange(e.target.value)}>
      {valor === '' && <option value="">— elegir —</option>}
      {!hay && <option value={valor}>{valor.slice(2)} (no encontrado)</option>}
      <optgroup label="Reguladores">{sueltos.map(n => <option key={n} value={`r:${n}`}>{n}</option>)}</optgroup>
      <optgroup label="Bancos">{bancos.map(n => <option key={n} value={`b:${n}`}>{n}</option>)}</optgroup>
    </select>
  )
}

function SelNombre({ valor, lista, onChange }: { valor: string; lista: string[]; onChange: (v: string) => void }) {
  const hay = valor === '' || lista.includes(valor)
  return (
    <select className={inp} value={valor} onChange={e => onChange(e.target.value)}>
      {valor === '' && <option value="">— elegir —</option>}
      {!hay && <option value={valor}>{valor} (no encontrado)</option>}
      {lista.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}

const aReg = (v: string) => (v[0] === 'b' ? { banco: v.slice(2) } : { ref: v.slice(2) })
const deReg = (n: { ref?: string; banco?: string }) => n.banco != null ? `b:${n.banco}` : n.ref ? `r:${n.ref}` : ''

// Fases/equipo de campo al que apunta un nodo o vínculo (para listar sus mediciones y señales libres)
function camposDe(cfg: AppConfig, o: { tipo?: string; ref?: string; banco?: string }): CampoConfig[] {
  if (o.banco != null) return fasesDeBanco(cfg, o.banco)
  const lista = o.tipo === 'reco' ? cfg.reconectadores : cfg.reguladores
  return (lista ?? []).filter(c => c.name === o.ref)
}

// Mediciones/señales libres por nombre (unión de las fases de un banco)
function libres(campos: CampoConfig[]) {
  const meds = new Map<string, string>(), senales = new Set<string>()
  for (const c of campos) {
    const p = puntosLibres(c)
    p.meds.forEach(m => meds.set(m.nombre!, m.unidad ?? ''))
    p.senales.forEach(s => senales.add(s.nombre!))
  }
  return { meds: [...meds], senales: [...senales] }
}

function Vinculos({ nodo, cfg, generales, esSitio, cambiar }: {
  nodo: Nodo; cfg: AppConfig; generales: Nodo[]; esSitio: boolean; cambiar: (f: (n: Nodo) => Nodo, clave: string) => void
}) {
  const v = nodo.vinculo
  const modo = !v ? 'ninguno' : 'desde' in v ? 'desde' : 'equipo'
  const poner = (nv: Vinculo | undefined, clave = 'vinculo') => cambiar(n => {
    const { vinculo: _v, ...r } = n
    return nv ? { ...r, vinculo: nv } : r
  }, clave)
  const eq = v && !('desde' in v) ? v : undefined
  const campos = eq && eq.kind === 'reg' ? camposDe(cfg, { tipo: 'reg', ref: eq.ref, banco: eq.banco }) : []
  const L = libres(campos)
  const base = (x: Partial<Extract<Vinculo, { kind: 'medidor' | 'reg' }>>) => ({ nominal: 220, umbralPct: 50, ...eq, ...x }) as Vinculo
  return (
    <div className="mt-3 border-t pt-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado de la fuente</div>
      <Fila t="Origen">
        <select className={inp} value={modo} onChange={e => {
          const m = e.target.value
          if (m === 'ninguno') poner(undefined)
          else if (m === 'desde') poner({ desde: generales[0]?.id ?? '' })
          else poner({ kind: 'medidor', ref: nombres(cfg.meters)[0] ?? '', nominal: 220, umbralPct: 50 })
        }}>
          <option value="ninguno">Siempre energizada</option>
          <option value="equipo">Según la tensión de un equipo</option>
          {esSitio && <option value="desde">Según un nodo de la red general</option>}
        </select>
      </Fila>
      {v && 'desde' in v && (
        <Fila t="Nodo del general">
          <select className={inp} value={v.desde} onChange={e => poner({ desde: e.target.value })}>
            {!generales.some(g => g.id === v.desde) && <option value={v.desde}>{v.desde} (no encontrado)</option>}
            {generales.map(g => <option key={g.id} value={g.id}>{g.tipo} · {g.nombre || g.ref || g.banco || '—'} ({g.id})</option>)}
          </select>
        </Fila>
      )}
      {eq && <>
        <Fila t="Tipo de equipo">
          <select className={inp} value={eq.kind} onChange={e => {
            const kind = e.target.value as 'medidor' | 'reg'
            poner({ kind, ref: kind === 'medidor' ? nombres(cfg.meters)[0] ?? '' : nombres(cfg.reguladores)[0] ?? '', nominal: eq.nominal, umbralPct: eq.umbralPct })
          }}>
            <option value="medidor">Medidor</option>
            <option value="reg">Regulador / banco</option>
          </select>
        </Fila>
        <Fila t="Equipo">
          {eq.kind === 'medidor'
            ? <SelNombre valor={eq.ref ?? ''} lista={nombres(cfg.meters)} onChange={ref => poner({ kind: 'medidor', ref, nominal: eq.nominal, umbralPct: eq.umbralPct })} />
            : <SelReg valor={deReg(eq)} cfg={cfg} onChange={x => poner({ kind: 'reg', ...aReg(x), ...(eq.med ? { med: eq.med } : {}), nominal: eq.nominal, umbralPct: eq.umbralPct })} />}
        </Fila>
        {eq.kind === 'reg' && (
          <Fila t="Medición de tensión">
            <select className={inp} value={eq.med ?? ''} onChange={e => {
              const { med: _m, ...r } = eq
              poner(e.target.value ? { ...r, med: e.target.value } : r as Vinculo)
            }}>
              <option value="">Tensión del regulador</option>
              {eq.med && !L.meds.some(([n]) => n === eq.med) && <option value={eq.med}>{eq.med} (no encontrada)</option>}
              {L.meds.map(([n, u]) => <option key={n} value={n}>{n}{u ? ` (${u})` : ''}</option>)}
            </select>
          </Fila>
        )}
        <Fila t="Tensión nominal (V)"><Num value={eq.nominal} min={1} onChange={x => poner(base({ nominal: x }), 'v-nominal')} /></Fila>
        <Fila t="Umbral (% del nominal)"><Num value={eq.umbralPct ?? 50} min={0} max={100} onChange={x => poner(base({ umbralPct: x }), 'v-umbral')} /></Fila>
      </>}
    </div>
  )
}

const ROTS: Rot[] = [0, 90, 180, 270]
const LADOS: Lado[] = ['arriba', 'abajo', 'izquierda', 'derecha']
const NOMBRE_BORNE: Record<string, string> = { a: 'Entrada (a)', b: 'Salida (b)', s: 'Secundario (s)', m: 'Medición (m)', d: 'Datos (d)' }
// Lado de un borne; el de siempre no se guarda (y sin ninguno movido, el nodo queda sin lados)
function conLado(n: Nodo, p: string, l: Lado): Nodo {
  const { lados: _l, ...r } = n
  const lados = { ...n.lados, [p]: l }
  if (l === ladoPorDefecto(n, p)) delete lados[p]
  return Object.keys(lados).length ? { ...r, lados } : r
}
// Nodos del general que pueden estar energizados (ids de sitio y de general son espacios distintos)
const ENERGIZABLES = ['fuente', 'barra', 'trafo', 'tc', 'tp', 'seccionador', 'fusible', 'carga', 'reco', 'reg', 'medidor', 'bomba']
const TIENE_NOMBRE = ['fuente', 'trafo', 'seccionador', 'fusible', 'carga', 'tc', 'tp', 'entrada', 'salida']

// Panel de propiedades del nodo seleccionado (spec §4)
export default function Propiedades({ nodo, dibujo, general, cfg, sitios, cambiar }: {
  nodo: Nodo
  dibujo: Dibujo
  general: Dibujo | undefined
  cfg: AppConfig
  sitios: Dibujo[]
  cambiar: (f: (n: Nodo) => Nodo, clave: string) => void
}) {
  const set = (p: Partial<Nodo>, clave: string) => cambiar(n => ({ ...n, ...p }), `${nodo.id}:${clave}`)
  const t = nodo.tipo
  const fijas = FIJAS[t]
  const L = t === 'reco' || t === 'reg' ? libres(camposDe(cfg, nodo)) : { meds: [], senales: [] }
  const alt = (m: Parameters<typeof alternarMostrar>[1]) => cambiar(n => alternarMostrar(n, m), `${nodo.id}:mostrar`)

  const equipo = (() => {
    switch (t) {
      case 'reco': return <SelNombre valor={nodo.ref ?? ''} lista={nombres(cfg.reconectadores)} onChange={ref => set({ ref }, 'ref')} />
      case 'medidor': return <SelNombre valor={nodo.ref ?? ''} lista={nombres(cfg.meters)} onChange={ref => set({ ref }, 'ref')} />
      case 'bomba': return <SelNombre valor={nodo.ref ?? ''} lista={nombres(cfg.devices)} onChange={ref => set({ ref }, 'ref')} />
      case 'caudalimetro': return <SelNombre valor={nodo.ref ?? ''} lista={nombres(cfg.flowmeters)} onChange={ref => set({ ref }, 'ref')} />
      case 'comm': return <SelNombre valor={nodo.ref ?? ''} lista={nombres(cfg.comms)} onChange={ref => set({ ref }, 'ref')} />
      case 'reg': return <SelReg valor={deReg(nodo)} cfg={cfg} onChange={v => cambiar(n => { const { ref: _r, banco: _b, ...r } = n; return { ...r, ...aReg(v) } }, `${nodo.id}:ref`)} />
      default: return null
    }
  })()

  return (
    <div className="w-64 shrink-0 overflow-y-auto rounded-lg border bg-card p-3 text-sm">
      <div className="mb-2 font-semibold capitalize">{t}</div>
      {equipo && <Fila t={t === 'reg' ? 'Regulador o banco' : 'Equipo'}>{equipo}</Fila>}
      {TIENE_NOMBRE.includes(t) && <Fila t="Nombre"><input className={inp} maxLength={80} value={nodo.nombre ?? ''} onChange={e => set({ nombre: e.target.value }, 'nombre')} /></Fila>}
      {(t === 'tc' || t === 'tp') && <Fila t="Relación"><input className={inp} maxLength={40} placeholder={t === 'tc' ? '200/5 A' : '13200/110 V'} value={nodo.relacion ?? ''} onChange={e => set({ relacion: e.target.value }, 'relacion')} /></Fila>}
      {(t === 'seccionador' || t === 'fusible') && (
        <label className="mb-2 flex items-center gap-2"><input type="checkbox" checked={!!nodo.cerrado} onChange={e => set({ cerrado: e.target.checked }, 'cerrado')} />Cerrado</label>
      )}
      {t === 'barra' && <Fila t="Largo (múltiplo de 10, 40–2000)"><Num value={nodo.largo} min={40} max={2000} step={10} onChange={largo => set({ largo }, 'largo')} /></Fila>}
      {t !== 'barra' && t !== 'sitio' && bornes(nodo).length > 0 && <Fila t="Bornes">
        <div className="flex flex-col gap-1">{bornes(nodo).map(b => (
          <label key={b.id} className="flex items-center justify-between gap-2 text-xs"><span>{NOMBRE_BORNE[b.id] ?? b.id}</span>
            <select className={inp + ' w-28'} value={b.lado} onChange={e => cambiar(n => conLado(n, b.id, e.target.value as Lado), `${nodo.id}:lados`)}>
              {LADOS.map(l => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
            </select>
          </label>
        ))}</div>
      </Fila>}
      {!['texto', 'recuadro', 'sitio'].includes(t) && <Fila t="Posición del texto">
        <select className={inp} value={typeof nodo.posTexto === 'object' ? 'libre' : nodo.posTexto ?? 'abajo'}
          onChange={e => cambiar(n => { const { posTexto: _p, ...r } = n; const v = e.target.value; return v === 'abajo' ? r : { ...r, posTexto: v === 'libre' ? { dx: 30, dy: 30 } : v as Lado } }, `${nodo.id}:posTexto`)}>
          <option value="abajo">Abajo</option><option value="arriba">Arriba</option><option value="izquierda">Izquierda</option><option value="derecha">Derecha</option><option value="libre">Libre (arrastrar en el dibujo)</option>
        </select>
      </Fila>}
      {t === 'texto' && <>
        <Fila t="Texto"><textarea className={inp} rows={3} maxLength={200} value={nodo.texto ?? ''} onChange={e => set({ texto: e.target.value }, 'texto')} /></Fila>
        <Fila t="Tamaño">
          <select className={inp} value={nodo.tam ?? 16} onChange={e => set({ tam: +e.target.value }, 'tam')}>
            <option value={12}>Chico</option><option value={16}>Mediano</option><option value={24}>Grande</option>
          </select>
        </Fila>
      </>}
      {t === 'recuadro' && <>
        <Fila t="Título"><input className={inp} maxLength={80} value={nodo.titulo ?? ''} onChange={e => set({ titulo: e.target.value }, 'titulo')} /></Fila>
        <Fila t="Ancho"><Num value={nodo.ancho} min={20} step={1} onChange={ancho => set({ ancho }, 'ancho')} /></Fila>
        <Fila t="Alto"><Num value={nodo.alto} min={20} step={1} onChange={alto => set({ alto }, 'alto')} /></Fila>
      </>}
      {t === 'sitio' && (
        <Fila t="Dibujo de sitio">
          <select className={inp} value={nodo.dibujo ?? ''} onChange={e => set({ dibujo: e.target.value }, 'dibujo')}>
            {!sitios.some(s => s.id === nodo.dibujo) && <option value={nodo.dibujo ?? ''}>— elegir —</option>}
            {sitios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Fila>
      )}
      {!['texto', 'recuadro', 'sitio', 'comm', 'caudalimetro'].includes(t) && (
        <Fila t="Rotación">
          <select className={inp} value={nodo.rot ?? 0} onChange={e => set({ rot: +e.target.value as Rot }, 'rot')}>
            {ROTS.map(r => <option key={r} value={r}>{r}°</option>)}
          </select>
        </Fila>
      )}
      {fijas && (
        <div className="mt-3 border-t pt-2">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mostrar junto al símbolo</div>
          {Object.entries(fijas).map(([k, [etiqueta, unidad]]) => (
            <label key={k} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={tieneMostrar(nodo, k)} onChange={() => alt(k)} />{etiqueta}{unidad && <span className="text-muted-foreground">({unidad})</span>}</label>
          ))}
          {L.meds.map(([n, u]) => (
            <label key={'m' + n} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={tieneMostrar(nodo, { med: n })} onChange={() => alt({ med: n })} />{n}{u && <span className="text-muted-foreground">({u})</span>}</label>
          ))}
          {L.senales.map(n => (
            <label key={'s' + n} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={tieneMostrar(nodo, { senal: n })} onChange={() => alt({ senal: n })} /><span className="h-2 w-2 rounded-full bg-green-500" />{n}</label>
          ))}
        </div>
      )}
      {t === 'fuente' && <Vinculos nodo={nodo} cfg={cfg} generales={general?.nodos.filter(n => ENERGIZABLES.includes(n.tipo)) ?? []} esSitio={dibujo.tipo === 'sitio'} cambiar={cambiar} />}
    </div>
  )
}
