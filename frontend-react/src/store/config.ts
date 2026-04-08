import { create } from 'zustand'
import type { AppConfig } from '../types'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

const MOCK_CONFIG: AppConfig = {
  devices: [
    { name: 'SAER 1', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50200, unitId: 1, enabled: true },
    { name: 'SAER 2', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50201, unitId: 1, enabled: true },
    { name: 'SAER 3', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50202, unitId: 1, enabled: true },
    { name: 'SAER 4', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 50203, unitId: 1, enabled: true },
    { name: 'SAER 8', type: 'SSW900', site: 'Agriplus', ip: '172.18.0.3', port: 50240, unitId: 1, enabled: true },
    { name: 'SAER 5', type: 'SSW900', site: 'Agriplus', ip: '172.18.0.3', port: 50240, unitId: 1, enabled: true },
    { name: 'SSW900 Agrocaraya', type: 'SSW900', site: 'Agrocaraya', ip: '172.18.0.3', port: 50270, unitId: 4, enabled: true }
  ],
  gateways: [
    { name: 'PLC M241 Agriplus', ip: '192.168.10.40', port: 502, site: 'Agriplus' },
    { name: 'Gateway Agrocaraya', ip: '192.168.10.70', port: 502, site: 'Agrocaraya' }
  ],
  meters: [
    {
      name: 'PM8000',    type: 'PM8000', ip: '192.168.10.60', port: 502, unitId: 1, enabled: true,
      regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150 },
      ui: {
        title: 'Medición Línea Exclusiva',
        zones: {
          voltage: { min: 0, max: 36, green: 33, yellow: 34.5 },
          current: { min: 0, max: 200, green: 120, yellow: 170 },
          power:   { min: 0, max: 2000, green: 1500, yellow: 1800 },
          pf:      { min: 0, max: 1, green: 0.85, yellow: 0.95 }
        }
      }
    },
    { name: 'PM8000 #2', type: 'PM8000', ip: '192.168.10.61', port: 502, unitId: 1, enabled: false, regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150 } },
    { name: 'PM8000 #3', type: 'PM8000', ip: '192.168.10.62', port: 502, unitId: 1, enabled: false, regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150 } },
    { name: 'PM8000 #4', type: 'PM8000', ip: '192.168.10.63', port: 502, unitId: 1, enabled: false, regs: { voltage: 3026, current: 3010, power: 3060, pf: 3150 } }
  ],
  gaugeZones: {}
}

interface ConfigState {
  config: AppConfig | null
  loading: boolean
  error: string
  mode: string
  load: () => Promise<void>
  save: () => Promise<boolean>
  setConfig: (cfg: AppConfig) => void
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  error: '',
  mode: MODE,

  load: async () => {
    set({ loading: true, error: '' })
    try {
      if (get().mode === 'mock') {
        set({ config: JSON.parse(JSON.stringify(MOCK_CONFIG)) })
      } else {
        const r = await fetch(`${API_BASE}/config`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        set({ config: await r.json() })
      }
    } catch (e: any) {
      set({ error: e.message })
    } finally {
      set({ loading: false })
    }
  },

  save: async () => {
    const cfg = get().config
    if (!cfg) return false
    set({ loading: true, error: '' })
    try {
      if (get().mode === 'mock') {
        Object.assign(MOCK_CONFIG, cfg)
      } else {
        const r = await fetch(`${API_BASE}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg)
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      }
      return true
    } catch (e: any) {
      set({ error: e.message })
      return false
    } finally {
      set({ loading: false })
    }
  },

  setConfig: (config) => set({ config })
}))
