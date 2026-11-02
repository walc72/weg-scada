// Íconos de línea de los equipos de campo (gris, como el resto del diseño)

// Medidor de panel (frente de un PM8000/PM7400): marco, pantalla y fila de teclas
export const IconoMedidor = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" aria-hidden="true">
    <rect x={2.5} y={2.5} width={19} height={19} rx={2.5} />
    <rect x={5.5} y={5.5} width={13} height={9} rx={0.75} />
    <path d="M6.4 18h1.2M9.8 18h1.2M13.2 18h1.2M16.6 18h1.2" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

// Variador / arrancador (CFW900, SSW900): gabinete alto con pantalla y teclado circular
export const IconoVariador = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" aria-hidden="true">
    <rect x={5} y={1.5} width={14} height={21} rx={2} />
    <rect x={8.5} y={4.5} width={7} height={5} rx={0.5} />
    <circle cx={12} cy={14} r={2.5} />
    <path d="M8 19.5h8" strokeLinecap="round" />
  </svg>
)

// Regulador de tensión: tanque cilíndrico con aisladores arriba y el dial de posición
export const IconoRegulador = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    <rect x={5} y={8} width={14} height={14} rx={1.5} />
    <path d="M11 8V2.5M16 8V3.5" />
    <circle cx={8.5} cy={6} r={2} fill="hsl(var(--card))" />
    <rect x={11.5} y={13} width={5} height={5} rx={0.5} />
  </svg>
)

// Reconectador: tres columnas de aisladores sobre el gabinete
export const IconoReconectador = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    <rect x={2.5} y={16} width={19} height={5} rx={1} />
    <path d="M6.5 16V3M12 16V3M17.5 16V3" />
    <path d="M5 6.5h3M5 10h3M10.5 6.5h3M10.5 10h3M16 6.5h3M16 10h3" strokeWidth={1.5} />
  </svg>
)

// Tabla de variables
export const IconoTabla = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" aria-hidden="true">
    <rect x={3} y={4} width={18} height={16} rx={1.5} />
    <path d="M3 9h18M3 14.5h18M9 9v11" />
  </svg>
)
