import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/api', () => ({ apiJson: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { toast } from 'sonner'
import { apiJson } from '@/lib/api'
import { usePrefs, migrarMisGraficos } from './prefs'
import type { Grafico } from '@/lib/misGraficos'

const g = (id: string): Grafico => ({ id, titulo: '', trazas: [] })
const local = (v: unknown) => () => (typeof v === 'string' ? v : JSON.stringify(v))

afterEach(() => { vi.unstubAllGlobals() })
beforeEach(() => {
  vi.clearAllMocks()
  usePrefs.setState({ estado: 'cargando', dashboard: null, misGraficos: null, defecto: null })
})

describe('migrarMisGraficos', () => {
  it('servidor null + local con 2 → los 2', () => {
    expect(migrarMisGraficos('juan', null, local([g('a'), g('b')]))).toEqual([g('a'), g('b')])
  })
  it('servidor [] → null', () => { expect(migrarMisGraficos('juan', [], local([g('a')]))).toBeNull() })
  it('local inválido → null', () => { expect(migrarMisGraficos('juan', null, local('{no'))).toBeNull() })
  it('local vacío → null', () => {
    expect(migrarMisGraficos('juan', null, local([]))).toBeNull()
    expect(migrarMisGraficos('juan', null, () => null)).toBeNull()
  })
  it('usa la clave local por usuario', () => {
    const k = vi.fn(() => null)
    migrarMisGraficos('', null, k); expect(k).toHaveBeenCalledWith('weg_mis_graficos:anon')
  })
})

describe('cargar', () => {
  it('estado listo y campos', async () => {
    vi.mocked(apiJson).mockResolvedValue({ dashboard: { v: 1, items: [] }, misGraficos: [g('a')], defecto: { dashboard: { v: 1, items: [] } } })
    await usePrefs.getState().cargar('juan')
    const s = usePrefs.getState()
    expect(s.estado).toBe('listo')
    expect(s.misGraficos).toEqual([g('a')])
    expect(s.dashboard).toEqual({ v: 1, items: [] })
    expect(s.defecto).toEqual({ v: 1, items: [] })
  })
  it('si rechaza → error', async () => {
    vi.mocked(apiJson).mockRejectedValue(new Error('x'))
    await usePrefs.getState().cargar('juan')
    expect(usePrefs.getState().estado).toBe('error')
    expect(toast.error).toHaveBeenCalledWith('No se pudieron cargar tus preferencias')
  })
  it('servidor null y local presente → PUT /prefs/misGraficos', async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'weg_mis_graficos:juan' ? JSON.stringify([g('a')]) : null) })
    vi.mocked(apiJson).mockResolvedValueOnce({ dashboard: null, misGraficos: null, defecto: { dashboard: null } }).mockResolvedValue({ ok: true })
    await usePrefs.getState().cargar('juan')
    expect(apiJson).toHaveBeenCalledWith('/prefs/misGraficos', expect.objectContaining({ method: 'PUT', body: JSON.stringify([g('a')]) }))
    expect(usePrefs.getState().misGraficos).toEqual([g('a')])
  })
})

describe('cargar entre usuarios', () => {
  it('al empezar limpia lo del usuario anterior (B nunca ve lo de A)', async () => {
    usePrefs.setState({ estado: 'listo', misGraficos: [g('A')], dashboard: { v: 1, items: [] } as any, defecto: null })
    let res!: (v: unknown) => void
    vi.mocked(apiJson).mockReturnValueOnce(new Promise(r => { res = r }) as any)
    const p = usePrefs.getState().cargar('b')
    expect(usePrefs.getState()).toMatchObject({ estado: 'cargando', misGraficos: null, dashboard: null })
    res({ dashboard: null, misGraficos: null, defecto: { dashboard: null } })
    await p
    expect(usePrefs.getState().misGraficos).toBeNull()
  })
  it('una respuesta vieja que llega tarde se ignora', async () => {
    let resA!: (v: unknown) => void
    vi.mocked(apiJson).mockReturnValueOnce(new Promise(r => { resA = r }) as any)
      .mockResolvedValueOnce({ dashboard: null, misGraficos: [g('B')], defecto: { dashboard: null } })
    const pA = usePrefs.getState().cargar('a')
    await usePrefs.getState().cargar('b')
    resA({ dashboard: null, misGraficos: [g('A')], defecto: { dashboard: null } })
    await pA
    expect(usePrefs.getState().misGraficos).toEqual([g('B')])
  })
})

describe('guardar / borrar', () => {
  it('actualiza el estado solo si el PUT sale bien; si falla relanza', async () => {
    vi.mocked(apiJson).mockResolvedValueOnce({ ok: true })
    await usePrefs.getState().guardar('misGraficos', [g('a')])
    expect(usePrefs.getState().misGraficos).toEqual([g('a')])
    vi.mocked(apiJson).mockRejectedValueOnce(new Error('no'))
    await expect(usePrefs.getState().guardar('misGraficos', [g('b')])).rejects.toThrow('no')
    expect(usePrefs.getState().misGraficos).toEqual([g('a')])
  })
  it('borrar y defecto', async () => {
    vi.mocked(apiJson).mockResolvedValue({ ok: true })
    const l = { v: 1, items: [] } as any
    await usePrefs.getState().guardarDefecto(l)
    expect(apiJson).toHaveBeenCalledWith('/prefs/defecto/dashboard', expect.objectContaining({ method: 'PUT' }))
    expect(usePrefs.getState().defecto).toEqual(l)
    await usePrefs.getState().borrarDefecto()
    expect(usePrefs.getState().defecto).toBeNull()
    usePrefs.setState({ dashboard: l })
    await usePrefs.getState().borrar('dashboard')
    expect(usePrefs.getState().dashboard).toBeNull()
  })
})
