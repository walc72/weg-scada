// Paleta del editor: grupos de la spec §2.2; se arrastra al lienzo o se hace clic para agregar al centro
export const GRUPOS: { titulo: string; items: [tipo: string, etiqueta: string][] }[] = [
  { titulo: 'Equipos', items: [['reco', 'Reconectador'], ['reg', 'Regulador / banco'], ['medidor', 'Medidor'], ['bomba', 'Bomba'], ['caudalimetro', 'Caudalímetro']] },
  { titulo: 'Eléctricos', items: [['fuente', 'Fuente'], ['barra', 'Barra'], ['trafo', 'Transformador'], ['seccionador', 'Seccionador'], ['fusible', 'Fusible'], ['carga', 'Carga']] },
  { titulo: 'Comunicaciones', items: [['comm', 'Equipo de comunicación']] },
  { titulo: 'Dibujo', items: [['texto', 'Texto'], ['recuadro', 'Recuadro'], ['sitio', 'Bloque de sitio']] },
]

export default function Paleta({ onAgregar, haySitios, esGeneral }: {
  onAgregar: (tipo: string) => void
  haySitios: boolean // existe algún dibujo de sitio al que apuntar
  esGeneral: boolean
}) {
  return (
    <div className="w-44 shrink-0 overflow-y-auto rounded-lg border bg-card p-2 text-sm">
      {GRUPOS.map(g => (
        <div key={g.titulo} className="mb-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</div>
          {g.items.map(([tipo, etiqueta]) => {
            const off = tipo === 'sitio' && !(esGeneral && haySitios)
            return (
              <button key={tipo} type="button" disabled={off} draggable={!off}
                title={off ? 'Solo en la red general y con algún sitio creado' : 'Arrastrar al lienzo o hacer clic'}
                onDragStart={e => { e.dataTransfer.setData('application/unifilar', tipo); e.dataTransfer.effectAllowed = 'copy' }}
                onClick={() => onAgregar(tipo)}
                className="mb-1 block w-full rounded border px-2 py-1 text-left hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent">
                {etiqueta}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
