import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import Mimico from '../Mimico'
import type { Vivos } from '../../lib/energizar'
import type { Nodo } from '../../lib/unifilar'
import { resumenEquipo } from '../../lib/resumenEquipo'
import { equipoDe } from './Mediciones'
import TendenciaEquipo from './TendenciaEquipo'
import PanelLateral from '../panel/PanelLateral'
import EncabezadoEquipo from '../panel/EncabezadoEquipo'
import ValoresClave from '../panel/ValoresClave'
import FilasBanco from '../panel/FilasBanco'
import { useLicense } from '../../store/license'

// Panel lateral de un equipo del unifilar: vistazo rápido con el mismo formato para todos los tipos
export default function PanelEquipo({ nodo, vivos, onClose }: { nodo: Nodo; vivos: Vivos; onClose: () => void }) {
  const generadores = useLicense(s => s.hasModule('generadores'))
  const r = resumenEquipo(nodo, vivos, { generadores })
  return (
    <PanelLateral titulo={r.titulo} onClose={onClose}>
      <EncabezadoEquipo titulo={r.titulo} subtitulo={r.subtitulo} estado={r.estado} onClose={onClose} />
      {!r.existe ? <div className="text-sm text-(--p3-text)">Equipo no encontrado en la configuración</div> : <>
        {r.alarmas.length > 0 && (
          <div className="flex flex-col gap-1">
            {r.alarmas.map((a, i) => (
              <div key={i} className={`flex items-center gap-1.5 text-xs font-semibold ${a.prioridad === 'p3' ? 'text-(--p3-text)' : 'text-(--p1-text)'}`}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a.texto}
              </div>
            ))}
          </div>
        )}
        {r.banco ? <>
          <Mimico regs={equipoDe(nodo, vivos).campos.map(c => c.cfg)} campo={vivos.campo} />
          <FilasBanco filas={r.banco} />
        </> : <ValoresClave valores={r.valores} />}
        <TendenciaEquipo nodo={nodo} config={vivos.config} />
        <div className="flex gap-4 text-sm">
          {r.detalle && <Link to={r.detalle} className="text-primary underline">Ver detalle</Link>}
          <Link to="/historicos" className="text-primary underline">Ver en Tendencias</Link>
        </div>
      </>}
    </PanelLateral>
  )
}
