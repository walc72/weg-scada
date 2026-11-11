import { describe, it, expect, vi } from 'vitest'

// El store lee window/localStorage al cargarse: entorno mínimo antes de importarlo
const mem = new Map<string, string>()
vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost' } })
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
const { useDrivesStore } = await import('./drives')

describe('mensajes en vivo en lote', () => {
  it('los datos de todos los equipos de una vuelta llegan al store en pocas actualizaciones', () => {
    vi.useFakeTimers()
    let cambios = 0
    const quitar = useDrivesStore.subscribe((s, p) => { if (s.drives !== p.drives) cambios++ })
    useDrivesStore.getState().connect(2000)
    vi.advanceTimersByTime(2500)
    const equipos = useDrivesStore.getState().drives.size
    useDrivesStore.getState().disconnect()
    quitar(); vi.useRealTimers()
    expect(equipos).toBeGreaterThan(3)
    expect(cambios).toBeLessThanOrEqual(3)
  })
})
