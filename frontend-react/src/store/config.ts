import { create } from 'zustand'
import type { AppConfig } from '../types'
import { toast } from 'sonner'
import { authFetch } from './auth'
import { useLicense } from './license'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

const MOCK_CONFIG: AppConfig = {
  devices: [
    { name: 'SAER 1', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50200, unitId: 1, enabled: true, caudal: { modo: 'manual', nominal: 320 } },
    { name: 'SAER 2', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50201, unitId: 1, enabled: true, caudal: { modo: 'real', nominal: 0 } },
    { name: 'SAER 3', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50202, unitId: 1, enabled: true, caudal: { modo: 'manual', nominal: 300 } },
    { name: 'SAER 4', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50203, unitId: 1, enabled: true, caudal: { modo: 'real', nominal: 0 } },
    { name: 'SAER 8', type: 'SSW900', site: 'Agriplus', ip: '172.18.0.3', port: 50240, unitId: 1, enabled: true, gateway: 'PLC M241 Agriplus', slot: 0, caudal: { modo: 'real', nominal: 0 } },
    { name: 'SAER 5', type: 'SSW900', site: 'Agriplus', ip: '172.18.0.3', port: 50240, unitId: 1, enabled: true, gateway: 'PLC M241 Agriplus', slot: 1 },
    { name: 'SSW900 Agrocaraya', type: 'SSW900', site: 'Agrocaraya', ip: '172.18.0.3', port: 50270, unitId: 4, enabled: true, gateway: 'Gateway Agrocaraya', statusOffset: 679 }
  ],
  gateways: [
    { name: 'PLC M241 Agriplus', ip: '192.168.10.40', port: 502, site: 'Agriplus', kind: 'plc', slots: [
      { id: 0, regOffset: 0, statusOffset: 140, label: 'SAER 8' },
      { id: 1, regOffset: 70, statusOffset: 152, label: 'SAER 5' },
    ] },
    { name: 'Gateway Agrocaraya', ip: '192.168.10.70', port: 502, site: 'Agrocaraya', kind: 'adam', enlace: 'RUT Agrocaraya' }
  ],
  comms: [
    { name: 'PtP Agriplus', tipo: 'airmax', ip: '192.168.10.2', enabled: true },
    { name: 'RUT Agrocaraya', tipo: 'rut', ip: '192.168.10.71', enabled: true },
    { name: 'RUT Colector Norte', tipo: 'rut', ip: '192.168.10.81', enabled: true },
  ],
  meters: [
    {
      name: 'PM8000',    type: 'PM8000', ip: '192.168.10.60', port: 502, unitId: 1, enabled: true,
      regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150, reactive: 3068 },
      ui: {
        title: 'Medición Línea Exclusiva',
        zones: {
          voltage: { min: 0, max: 36, redLow: 30, green: 33, yellow: 34.5 },
          current: { min: 0, max: 200, green: 120, yellow: 170 },
          power:   { min: 0, max: 2000, green: 1500, yellow: 1800 },
          pf:      { min: 0, max: 1, green: 0.85, yellow: 0.95 }
        }
      }
    },
    { name: 'PM8000 #2', type: 'PM8000', ip: '192.168.10.61', port: 502, unitId: 1, enabled: false, regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150, reactive: 3068 } },
    { name: 'PM8000 #3', type: 'PM8000', ip: '192.168.10.62', port: 502, unitId: 1, enabled: false, regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150, reactive: 3068 } },
    { name: 'PM8000 #4', type: 'PM8000', ip: '192.168.10.63', port: 502, unitId: 1, enabled: false, regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150, reactive: 3068 } }
  ],
  lossMeter: { main: 'PM8000', subtract: ['PM8000 #2', 'PM8000 #4'] },
  reguladores: [
    { name: 'Tapelectro RG1', modelo: 'tapelectro', ip: '192.168.13.13', enabled: true, banco: 'Banco Tapelectro', tapMin: -16, tapMax: 16, mapa: [
      { key: 'med', addr: 0, nombre: 'Tensión fuente', unidad: 'V' }, { key: 'med', addr: 1, nombre: 'Tensión carga', unidad: 'V' },
      { key: 'senal', addr: 2, nombre: 'Tensión en rango' }, { key: 'senal', addr: 3, nombre: 'Motor elevando' }, { key: 'senal', addr: 4, nombre: 'Motor bajando' },
      { key: 'med', addr: 5, nombre: 'Tap máximo memorizado' }, { key: 'med', addr: 6, nombre: 'Tap mínimo memorizado' } ] },
    { name: 'Tapelectro RG2', modelo: 'tapelectro', ip: '192.168.13.13', enabled: true, banco: 'Banco Tapelectro', tapMin: -16, tapMax: 16, mapa: [
      { key: 'med', addr: 0, nombre: 'Tensión fuente', unidad: 'V' }, { key: 'med', addr: 1, nombre: 'Tensión carga', unidad: 'V' },
      { key: 'senal', addr: 2, nombre: 'Tensión en rango' }, { key: 'senal', addr: 3, nombre: 'Motor elevando' }, { key: 'senal', addr: 4, nombre: 'Motor bajando' },
      { key: 'med', addr: 5, nombre: 'Tap máximo memorizado' }, { key: 'med', addr: 6, nombre: 'Tap mínimo memorizado' } ] },
    { name: 'Tapelectro RG3', modelo: 'tapelectro', ip: '192.168.13.13', enabled: true, banco: 'Banco Tapelectro', tapMin: -16, tapMax: 16, mapa: [
      { key: 'med', addr: 0, nombre: 'Tensión fuente', unidad: 'V' }, { key: 'med', addr: 1, nombre: 'Tensión carga', unidad: 'V' },
      { key: 'senal', addr: 2, nombre: 'Tensión en rango' }, { key: 'senal', addr: 3, nombre: 'Motor elevando' }, { key: 'senal', addr: 4, nombre: 'Motor bajando' },
      { key: 'med', addr: 5, nombre: 'Tap máximo memorizado' }, { key: 'med', addr: 6, nombre: 'Tap mínimo memorizado' } ] },
  ],
  reconectadores: [
    { name: 'Reco Línea Norte', modelo: 'advc', ip: '192.168.20.5', enabled: true, mapa: [
      { key: 'med', addr: 0, nombre: 'Corriente de tierra', unidad: 'A' }, { key: 'med', addr: 1, nombre: 'Vida de contactos', unidad: '%' },
      { key: 'senal', addr: 2, nombre: 'Protección activa' }, { key: 'senal', addr: 3, nombre: 'Reconexión automática' } ] },
    { name: 'Reco Agrocaraya', modelo: 'advc', ip: '192.168.20.5', enabled: true, mapa: [
      { key: 'med', addr: 0, nombre: 'Corriente de tierra', unidad: 'A' }, { key: 'med', addr: 1, nombre: 'Vida de contactos', unidad: '%' },
      { key: 'senal', addr: 2, nombre: 'Protección activa' }, { key: 'senal', addr: 3, nombre: 'Reconexión automática' } ] },
  ],
  // Generador de ejemplo (DSE 8610): solo los puntos libres que muestra el portal
  generadores: [
    { name: 'Grupo Electrógeno 1', modelo: 'dse8610', ip: '192.168.10.71', port: 502, unitId: 10, enabled: true, mapa: [
      { key: 'med', addr: 1024, nombre: 'Presión de aceite', unidad: 'kPa' }, { key: 'med', addr: 1025, nombre: 'Temperatura refrigerante', unidad: '°C' },
      { key: 'med', addr: 1027, nombre: 'Nivel de combustible', unidad: '%', principal: true }, { key: 'med', addr: 1028, nombre: 'Tensión alternador de carga', unidad: 'V', decimales: 1 },
      { key: 'med', addr: 1029, nombre: 'Tensión de batería', unidad: 'V', decimales: 1, principal: true }, { key: 'med', addr: 1059, nombre: 'Frecuencia de red', unidad: 'Hz', decimales: 1 },
      { key: 'med', addr: 1060, nombre: 'Tensión de red L1-N', unidad: 'V' }, { key: 'med', addr: 1544, nombre: 'Potencia aparente', unidad: 'kVA' },
      { key: 'med', addr: 1800, nombre: 'Energía generada', unidad: 'kWh' },
      { key: 'alarma', addr: 39430, nib: 4, texto: 'Bajo nivel de combustible' } ] },
  ],
  flowmeters: [
    { name: 'Caudalímetro SAER 2', type: 'TUF2000', ip: '192.168.10.80', port: 502, unitId: 1, wordOrder: 'LE', totalMultiplier: 1, bombas: ['SAER 2'], enabled: true },
    { name: 'Colector Norte', type: 'TUF2000', ip: '192.168.10.80', port: 502, unitId: 2, wordOrder: 'LE', totalMultiplier: 1, bombas: ['SAER 4', 'SAER 8'], enabled: true },
  ],
  gaugeZones: {}
}

interface ConfigState {
  config: AppConfig | null
  error: string
  mode: string
  load: () => Promise<void>
  guardar: (cambio: (cfg: AppConfig) => AppConfig) => Promise<boolean>
}

type Set = (p: Partial<ConfigState>) => void
type Get = () => ConfigState

// Los guardados se encadenan: cada uno arranca cuando terminó el anterior y lee la
// config vigente recién en su turno (así un fallo no arrastra ni pisa a otro).
let cola: Promise<unknown> = Promise.resolve()

// Aplica `cambio` a la config vigente y la persiste (mock: MOCK_CONFIG; real: PUT /config +
// recarga). `config` cambia recién cuando el guardado se confirma: si falla queda la previa
// (las secciones con useEdicion conservan lo editado); en real re-sincroniza y avisa con un toast.
function persistir(set: Set, get: Get, cambio: (cfg: AppConfig) => AppConfig): Promise<boolean> {
  const turno = async (): Promise<boolean> => {
    const previa = get().config
    if (!previa) return false
    try {
      const cfg = cambio(structuredClone(previa))
      if (get().mode === 'mock') {
        Object.assign(MOCK_CONFIG, cfg)
        set({ config: cfg })
      } else {
        const r = await authFetch(`${API_BASE}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg)
        })
        if (!r.ok) {
          const d = r.status === 400 ? await r.json().catch(() => null) : null
          const det = Array.isArray(d?.details) && d.details.length ? [d.error, ...d.details].filter(Boolean).join(' · ') : ''
          throw new Error(det || `HTTP ${r.status}`)
        }
        set({ config: cfg })
        void useLicense.getState().load() // "Uso" y full() al día
        // El server ajusta la config al guardar (renombre/baja de bomba →
        // flowmeters[].bombas): recargarla para no reenviar datos viejos.
        await get().load()
      }
      return true
    } catch (e: any) {
      if (get().mode !== 'mock') await get().load() // sin red: config queda la previa
      toast.error('No se pudo guardar: ' + (e?.message || 'error desconocido'))
      return false
    }
  }
  const p = cola.then(turno)
  cola = p.catch(() => {})
  return p
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  error: '',
  mode: MODE,

  load: async () => {
    set({ error: '' })
    try {
      if (get().mode === 'mock') {
        set({ config: JSON.parse(JSON.stringify(MOCK_CONFIG)) })
      } else {
        // Reintenta ante cortes momentáneos (ej. reconexión de Tailscale =
        // "Failed to fetch") o 5xx transitorios. GET idempotente → seguro.
        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
        const MAX = 3
        let lastErr: any
        for (let attempt = 0; attempt < MAX; attempt++) {
          try {
            const r = await authFetch(`${API_BASE}/config`)
            if (!r.ok) {
              // 4xx (auth/validación) = definitivo; 5xx = transitorio → reintentar
              if (r.status >= 500 && attempt < MAX - 1) { lastErr = new Error(`HTTP ${r.status}`); await sleep(600 * (attempt + 1)); continue }
              throw new Error(`HTTP ${r.status}`)
            }
            const data = await r.json()
            if (!data.gaugeZones) data.gaugeZones = {}
            set({ config: data })
            lastErr = null
            break
          } catch (e: any) {
            lastErr = e
            if (attempt < MAX - 1) { await sleep(600 * (attempt + 1)); continue }
          }
        }
        if (lastErr) throw lastErr
      }
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  guardar: (cambio) => persistir(set, get, cambio),
}))
