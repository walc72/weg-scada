import { describe, expect, it } from 'vitest'
import { prioridadAlarma, ORDEN_PRIO } from './prioridadAlarma'

describe('prioridadAlarma', () => {
  it('falla y disparo son alta; sin comunicación es dato no válido, no una prioridad', () => {
    expect(prioridadAlarma('FALLA')).toBe('alta')
    expect(prioridadAlarma('DISPARO')).toBe('alta')
    expect(prioridadAlarma('SIN_COMUNICACION')).toBe('invalido')
  })
  it('bloqueo y errores de comunicación son media; umbrales y alarmas del equipo, baja', () => {
    expect(prioridadAlarma('BLOQUEO')).toBe('media')
    expect(prioridadAlarma('ERRORES_COMM')).toBe('media')
    for (const t of ['CORRIENTE_ALTA', 'TEMP_ALTA', 'ALARMA_EQUIPO', 'ALARMA_3']) expect(prioridadAlarma(t)).toBe('baja')
  })
  it('ordena alta primero y baja al final', () => {
    expect(ORDEN_PRIO.alta).toBeLessThan(ORDEN_PRIO.media)
    expect(ORDEN_PRIO.invalido).toBe(ORDEN_PRIO.media)
    expect(ORDEN_PRIO.media).toBeLessThan(ORDEN_PRIO.baja)
  })
})
