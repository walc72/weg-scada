// Modo sala de control del unifilar: cuándo volver a encuadrar el dibujo solo
export const ENCUADRE_MS = 5 * 60_000  // cada 5 min...
export const QUIETO_MS = 2 * 60_000    // ...si nadie movió el dibujo en los últimos 2 min

export const debeEncuadrar = (ahora: number, ultimaInteraccion: number, ultimoEncuadre: number) =>
  ahora - ultimoEncuadre >= ENCUADRE_MS && ahora - ultimaInteraccion >= QUIETO_MS
