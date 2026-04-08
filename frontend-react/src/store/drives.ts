import { create } from 'zustand'
import mqtt, { MqttClient } from 'mqtt'
import type { Drive, Meter } from '../types'
import { startMockDrives, stopMockDrives, MockHandle } from '../mock/drives'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const MQTT_URL = (import.meta.env.VITE_MQTT_URL as string) || `ws://${window.location.hostname}:9001`

interface Stats {
  total: number
  online: number
  running: number
  faults: number
  offline: number
  color: string
  icon: string
  text: string
}

interface DrivesState {
  drives: Map<string, Drive>
  meters: Map<string, Meter>
  connected: boolean
  mode: string
  driveList: () => Drive[]
  meterList: () => Meter[]
  stats: () => Stats
  connect: () => void
  disconnect: () => void
}

let mqttClient: MqttClient | null = null
let mockHandle: MockHandle | null = null

export const useDrivesStore = create<DrivesState>((set, get) => ({
  drives: new Map(),
  meters: new Map(),
  connected: false,
  mode: MODE,

  driveList: () => Array.from(get().drives.values()).sort((a, b) => a.index - b.index),
  meterList: () => Array.from(get().meters.values()),

  stats: () => {
    let total = 0, online = 0, running = 0, faults = 0
    const faultTexts: string[] = []
    for (const d of get().drives.values()) {
      total++
      if (d.online) {
        online++
        if (d.running) running++
        if (d.hasFault) {
          faults++
          faultTexts.push(`${d.displayName || d.name}: ${d.faultText}`)
        }
      }
    }
    let color: string, icon: string, text: string
    if (faults > 0) {
      color = '#ef4444'; icon = 'alert'; text = faultTexts.join(' | ')
    } else if (running > 0) {
      color = '#3b82f6'; icon = 'bolt'; text = `${running}/${online} DRIVES EN MARCHA`
    } else if (online > 0) {
      color = '#22c55e'; icon = 'check'; text = `${online}/${total} DRIVES ONLINE`
    } else {
      color = '#f59e0b'; icon = 'loader'; text = 'CONECTANDO...'
    }
    return { total, online, running, faults, offline: total - online, color, icon, text }
  },

  connect: () => {
    if (get().mode === 'mock') {
      mockHandle = startMockDrives({
        onDrive: (d) => {
          const map = new Map(get().drives)
          map.set(d.name, d)
          set({ drives: map })
        },
        onMeter: (m) => {
          const map = new Map(get().meters)
          map.set(m.name, m)
          set({ meters: map })
        }
      })
      set({ connected: true })
      return
    }

    mqttClient = mqtt.connect(MQTT_URL, {
      clientId: 'weg-react-' + Math.random().toString(16).substr(2, 8),
      reconnectPeriod: 2000
    })
    mqttClient.on('connect', () => {
      set({ connected: true })
      mqttClient?.subscribe(['weg/drives/+', 'weg/meters/+'])
    })
    mqttClient.on('close', () => set({ connected: false }))
    mqttClient.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString())
        if (topic.startsWith('weg/drives/')) {
          const map = new Map(get().drives)
          map.set(data.name, data)
          set({ drives: map })
        } else if (topic.startsWith('weg/meters/')) {
          const map = new Map(get().meters)
          map.set(data.name, data)
          set({ meters: map })
        }
      } catch { /* ignore */ }
    })
  },

  disconnect: () => {
    if (mqttClient) { mqttClient.end(true); mqttClient = null }
    if (mockHandle) { stopMockDrives(mockHandle); mockHandle = null }
    set({ connected: false })
  }
}))
