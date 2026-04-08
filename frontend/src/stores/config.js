import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MODE = import.meta.env.VITE_DATA_MODE || 'mock'
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// In-memory mock config (used when MODE === 'mock')
const MOCK_CONFIG = {
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
      name: 'PM8000', type: 'PM8000', ip: '192.168.10.60', port: 502, unitId: 1,
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
    }
  ],
  gaugeZones: {}
}

export const useConfigStore = defineStore('config', () => {
  const config = ref(null)
  const loading = ref(false)
  const error = ref('')
  const lastSaved = ref(null)
  const mode = ref(MODE)

  async function load() {
    loading.value = true
    error.value = ''
    try {
      if (mode.value === 'mock') {
        config.value = JSON.parse(JSON.stringify(MOCK_CONFIG))
      } else {
        const r = await fetch(`${API_BASE}/config`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        config.value = await r.json()
      }
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function save(partial) {
    loading.value = true
    error.value = ''
    try {
      const merged = { ...config.value, ...partial }
      if (mode.value === 'mock') {
        config.value = JSON.parse(JSON.stringify(merged))
        Object.assign(MOCK_CONFIG, merged)
      } else {
        const r = await fetch(`${API_BASE}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged)
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        config.value = merged
      }
      lastSaved.value = Date.now()
      return true
    } catch (e) {
      error.value = e.message
      return false
    } finally {
      loading.value = false
    }
  }

  const devices = computed(() => config.value?.devices || [])
  const meters = computed(() => config.value?.meters || [])
  const gateways = computed(() => config.value?.gateways || [])

  return { config, devices, meters, gateways, loading, error, lastSaved, mode, load, save }
})
