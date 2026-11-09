import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth', () => ({ authFetch: vi.fn() }))
vi.mock('./license', () => ({ useLicense: { getState: () => ({ load: vi.fn() }) } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { authFetch } from './auth'
import { useConfigStore } from './config'
import { edicionReducer, esSucio, estadoInicial, guardarCon } from '../components/config/useEdicion'
import type { AppConfig } from '../types'

const base = (): AppConfig => ({ devices: [], gateways: [], meters: [], flowmeters: [], gaugeZones: {} } as unknown as AppConfig)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  useConfigStore.setState({ mode: 'mock', config: base(), error: '' })
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

  it('si el cambio lanza (ítem que ya no existe) no guarda nada y avisa con el motivo', async () => {
    const previa = base()
    useConfigStore.setState({ config: previa })
    expect(await useConfigStore.getState().guardar(() => { throw new Error('SAER 1 ya no existe; recargá la página') })).toBe(false)
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe('No se pudo guardar: SAER 1 ya no existe; recargá la página')
    expect(useConfigStore.getState().config).toBe(previa)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('un guardar encolado detrás de uno que lanza se aplica igual', async () => {
    const pa = useConfigStore.getState().guardar(() => { throw new Error('X ya no existe; recargá la página') })
    const pb = useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: { b: 1 } as any }))
    expect(await pa).toBe(false)
    expect(await pb).toBe(true)
    expect((useConfigStore.getState().config as any).gaugeZones).toEqual({ b: 1 })
  })

  it('mientras el PUT está pendiente, config sigue siendo la previa', async () => {
    const previa = base()
    useConfigStore.setState({ mode: 'real', config: previa })
    let soltar: (r: any) => void = () => {}
    vi.mocked(authFetch).mockImplementation(((_u: string, init?: any) => init?.method === 'PUT'
      ? new Promise(r => { soltar = r })
      : Promise.resolve({ ok: true, status: 200, json: async () => ({ ...previa, gaugeZones: { x: 1 } }) })) as any)
    const p = useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: { x: 1 } as any }))
    await vi.waitFor(() => expect(authFetch).toHaveBeenCalled())
    expect(useConfigStore.getState().config).toBe(previa)
    soltar({ ok: true, status: 200 })
    expect(await p).toBe(true)
    expect((useConfigStore.getState().config as any).gaugeZones).toEqual({ x: 1 })
  })

  it('500 con la recarga caída: config queda la previa, sin tumbar la pantalla', async () => {
    vi.useFakeTimers()
    const previa = base()
    useConfigStore.setState({ mode: 'real', config: previa })
    vi.mocked(authFetch).mockResolvedValue({ ok: false, status: 500 } as any)
    const p = useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: { x: 1 } as any }))
    await vi.runAllTimersAsync()
    expect(await p).toBe(false)
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/^No se pudo guardar/)
    expect(useConfigStore.getState().config).toBe(previa) // ConfigView sigue montada (error && !config)
  })

  it('400 con details muestra el detalle y config queda la previa', async () => {
    const previa = base()
    useConfigStore.setState({ mode: 'real', config: previa })
    vi.mocked(authFetch).mockImplementation((async (_u: string, init?: any) => init?.method === 'PUT'
      ? { ok: false, status: 400, json: async () => ({ error: 'Límite', details: ['SAER 9 excede la licencia'] }) }
      : { ok: true, status: 200, json: async () => base() }) as any)
    expect(await useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: { x: 1 } as any }))).toBe(false)
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain('SAER 9 excede la licencia')
    expect(useConfigStore.getState().config).toEqual(previa)
    expect(useConfigStore.getState().error).toBe('')
  })

  it('con useEdicion, lo editado sobrevive a un guardado rechazado', async () => {
    useConfigStore.setState({ mode: 'real', config: base() })
    let soltar: (r: any) => void = () => {}
    vi.mocked(authFetch).mockImplementation(((_u: string, init?: any) => init?.method === 'PUT'
      ? new Promise(r => { soltar = r })
      : Promise.resolve({ ok: true, status: 200, json: async () => base() })) as any)
    const zonas = () => useConfigStore.getState().config!.gaugeZones as any
    let s = edicionReducer(estadoInicial(zonas()), { tipo: 'editar', valor: { v: 1 } })
    const despachar = (a: any) => { s = edicionReducer(s, a) }
    const p = guardarCon(v => useConfigStore.getState().guardar(c => ({ ...c, gaugeZones: v })), s.valor, s.visto, despachar)
    await vi.waitFor(() => expect(authFetch).toHaveBeenCalled())
    despachar({ tipo: 'original', original: zonas() }) // re-render durante el PUT
    soltar({ ok: false, status: 500 })
    expect(await p).toBe(false)
    despachar({ tipo: 'original', original: zonas() }) // re-render tras el rechazo
    expect(s.valor).toEqual({ v: 1 })
    expect(esSucio(s.original, s.valor)).toBe(true)
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
