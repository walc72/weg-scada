import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth', () => ({ authFetch: vi.fn() }))
vi.mock('./license', () => ({ useLicense: { getState: () => ({ load: vi.fn() }) } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { authFetch } from './auth'
import { useConfigStore } from './config'
import type { AppConfig } from '../types'

const base = (): AppConfig => ({ devices: [], gateways: [], meters: [], flowmeters: [], gaugeZones: {} } as unknown as AppConfig)

beforeEach(() => {
  vi.clearAllMocks()
  useConfigStore.setState({ mode: 'mock', config: base(), error: '', loading: false })
})

describe('guardar', () => {
  it('aplica el cambio sobre la config vigente (no pisa cambios de otra sección)', async () => {
    const X = { SAER_1: { high: 1 } } as any
    const Y = { voltage: { min: 0, max: 10 } } as any
    expect(await useConfigStore.getState().guardar(c => ({ ...c, alarmSetpoints: X }))).toBe(true)
    expect(await useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: Y }))).toBe(true)
    const c = useConfigStore.getState().config as any
    expect(c.alarmSetpoints).toEqual(X)
    expect(c.gaugeZones).toEqual(Y)
  })

  it('500 no pone error global y restaura la config', async () => {
    const previa = base()
    useConfigStore.setState({ mode: 'real', config: previa })
    vi.mocked(authFetch).mockResolvedValue({ ok: false, status: 500 } as any)
    const ok = await useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: { x: 1 } as any }))
    expect(ok).toBe(false)
    expect(useConfigStore.getState().error).toBe('')
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/^No se pudo guardar/)
    expect(useConfigStore.getState().config).toEqual(previa)
  })

  it('400 con details muestra el detalle', async () => {
    useConfigStore.setState({ mode: 'real', config: base() })
    vi.mocked(authFetch).mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Límite', details: ['SAER 9 excede la licencia'] }) } as any)
    expect(await useConfigStore.getState().guardar(c => c)).toBe(false)
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain('SAER 9 excede la licencia')
    expect(useConfigStore.getState().error).toBe('')
  })

  it('guardados concurrentes se serializan: el fallo de A no pisa ni arrastra a B', async () => {
    const inicial = base()
    useConfigStore.setState({ mode: 'real', config: inicial })
    const cuerpos: any[] = []
    let servidor: any = JSON.parse(JSON.stringify(inicial))
    vi.mocked(authFetch).mockImplementation((async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        cuerpos.push(JSON.parse(init.body))
        if (cuerpos.length === 1) { await new Promise(r => setTimeout(r, 20)); return { ok: false, status: 500 } }
        servidor = cuerpos[cuerpos.length - 1]
        return { ok: true, status: 200 }
      }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(servidor)) }
    }) as any)
    const pa = useConfigStore.getState().guardar(c => ({ ...c, alarmSetpoints: { a: 1 } as any }))
    const pb = useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: { b: 1 } as any }))
    expect(await pa).toBe(false)
    expect(await pb).toBe(true)
    expect(cuerpos).toHaveLength(2)
    expect(cuerpos[1].alarmSetpoints).toBeUndefined()
    expect(cuerpos[1].gaugeZones).toEqual({ b: 1 })
    const c = useConfigStore.getState().config as any
    expect(c.gaugeZones).toEqual({ b: 1 })
    expect(c.alarmSetpoints).toBeUndefined()
    expect(useConfigStore.getState().error).toBe('')
  })
})
