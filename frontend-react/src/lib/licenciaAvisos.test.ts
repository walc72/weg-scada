import { describe, it, expect } from 'vitest'
import { avisosLicencia, diasHasta } from './licenciaAvisos'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const en = (d: number) => new Date(NOW + d * 86_400_000).toISOString()

describe('avisosLicencia', () => {
  it('permanente: sin avisos', () => expect(avisosLicencia({ ok: true, vence: null, vencen: {}, vencidos: [] }, NOW)).toEqual([]))
  it('vence lejos: sin aviso; cerca: aviso', () => {
    expect(avisosLicencia({ ok: true, vence: en(40) }, NOW)).toEqual([])
    expect(avisosLicencia({ ok: true, vence: en(10) }, NOW)[0]).toMatch(/quedan 10 días/)
  })
  it('prueba de módulo siempre avisa', () => expect(avisosLicencia({ ok: true, vencen: { caudales: en(14) } }, NOW)[0]).toMatch(/caudales.*quedan 14 días/))
  it('prueba terminada y licencia vencida', () => {
    expect(avisosLicencia({ ok: true, vencidos: ['caudales'] }, NOW)[0]).toMatch(/Terminó la prueba de: caudales/)
    expect(avisosLicencia({ ok: false, motivo: 'vencida', vence: en(-1) }, NOW)[0]).toMatch(/modo básico/)
  })
  it('diasHasta no baja de 0', () => expect(diasHasta(en(-3), NOW)).toBe(0))
})
