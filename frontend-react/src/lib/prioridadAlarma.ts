import type { Prioridad } from '../marca/hecian-estados.js'

// Prioridad de cada tipo de evento de /api/alarms con los símbolos unificados HECIAN LC (src/marca/hecian-estados.*):
// alta = falla/disparo, media = bloqueo y errores de comunicación, dato no válido (círculo «?») = sin comunicación,
// baja = el resto (umbrales de corriente y temperatura, alarmas del equipo, ALARMA_<n> de reconectadores).
export type PrioAlarma = Extract<Prioridad, 'alta' | 'media' | 'baja' | 'invalido'>
export const prioridadAlarma = (tipo: string): PrioAlarma =>
  tipo === 'FALLA' || tipo === 'DISPARO' ? 'alta'
    : tipo === 'SIN_COMUNICACION' ? 'invalido'
      : tipo === 'ERRORES_COMM' || tipo === 'BLOQUEO' ? 'media' : 'baja'
// Orden de la lista: alta, después media y sin comunicación (el viejo P2), después baja
export const ORDEN_PRIO: Record<PrioAlarma, number> = { alta: 0, media: 1, invalido: 1, baja: 2 }
