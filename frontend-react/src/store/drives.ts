import { create } from 'zustand'
import mqtt, { MqttClient } from 'mqtt'
import type { Drive, Meter } from '../types'
import { startMockDrives, stopMockDrives, MockHandle } from '../mock/drives'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
const MQTT_URL = (import.meta.env.VITE_MQTT_URL as string) || `ws://${window.location.hostname}:9001`
const MAX_HISTORY = 90  // ~3 minutes at 2s interval

export interface HistoryPoint {
  ts: number
  current: number
  voltage: number
  power: number
  speed: number
  frequency: number
  igbtTemp: number
  scrTemp: number
  cosPhi: number
  online: number   // 1 | 0
  running: number  // 1 | 0
  stateCode: number
}

export interface MeterPoint extends Record<string, number> {
  ts: number
  current: number
  power: number
  pf: number
  voltage: number
}

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
  driveHistory: Map<string, HistoryPoint[]>
  meterHistory: Map<string, MeterPoint[]>
  connected: boolean
  mode: string
  refreshMs: number
  connect: (intervalMs?: number) => void
  disconnect: () => void
  setRefreshMs: (ms: number) => void
}

let mqttClient: MqttClient | null = null
let mockHandle: MockHandle | null = null

function pushDriveHistory(map: Map<string, HistoryPoint[]>, d: Drive): Map<string, HistoryPoint[]> {
  const next = new Map(map)
  const existing = next.get(d.name) ?? []
  const point: HistoryPoint = {
    ts: Date.now(),
    current: d.current,
    voltage: d.outputVoltage,
    power: d.power,
    speed: d.motorSpeed,
    frequency: d.frequency,
    igbtTemp: d.igbtTemp,
    scrTemp: d.scrTemp,
    cosPhi: d.cosPhi,
    online: d.online ? 1 : 0,
    running: d.running ? 1 : 0,
    stateCode: d.stateCode
  }
  const updated = existing.length >= MAX_HISTORY
    ? [...existing.slice(1), point]
    : [...existing, point]
  next.set(d.name, updated)
  return next
}

function pushMeterHistory(map: Map<string, MeterPoint[]>, m: Meter): Map<string, MeterPoint[]> {
  const next = new Map(map)
  const arr = next.get(m.name) ?? []
  const point: MeterPoint = {
    ts: Date.now(),
    current: m.current,
    power: m.power / 1000,
    pf: m.pf,
    voltage: m.voltage / 1000
  }
  const updated = arr.length >= MAX_HISTORY ? [...arr.slice(1), point] : [...arr, point]
  next.set(m.name, updated)
  return next
}

export const useDrivesStore = create<DrivesState>((set, get) => ({
  drives: new Map(),
  meters: new Map(),
  driveHistory: new Map(),
  meterHistory: new Map(),
  connected: false,
  mode: MODE,
  refreshMs: 2000,

  setRefreshMs: (ms: number) => {
    set({ refreshMs: ms })
    const { connected } = get()
    if (connected) {
      get().disconnect()
      get().connect(ms)
    }
  },

  connect: (intervalMs?: number) => {
    if (mqttClient || mockHandle) return
    const ms = intervalMs ?? get().refreshMs
    if (get().mode === 'mock') {
      mockHandle = startMockDrives({
        intervalMs: ms,
        onDrive: (d) => {
          const drives = new Map(get().drives)
          drives.set(d.name, d)
          const driveHistory = pushDriveHistory(get().driveHistory, d)
          set({ drives, driveHistory })
        },
        onMeter: (m) => {
          const meters = new Map(get().meters)
          meters.set(m.name, m)
          const meterHistory = pushMeterHistory(get().meterHistory, m)
          set({ meters, meterHistory })
        }
      })
      set({ connected: true })
      return
    }

    mqttClient = mqtt.connect(MQTT_URL, {
      clientId: 'weg-react-' + Math.random().toString(16).slice(2, 10),
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
          const drives = new Map(get().drives)
          drives.set(data.name, data)
          const driveHistory = pushDriveHistory(get().driveHistory, data)
          set({ drives, driveHistory })
        } else if (topic.startsWith('weg/meters/')) {
          const meters = new Map(get().meters)
          meters.set(data.name, data)
          const meterHistory = pushMeterHistory(get().meterHistory, data)
          set({ meters, meterHistory })
        }
      } catch (e) { console.debug('[MQTT] Failed to parse message:', e) }
    })
  },

  disconnect: () => {
    if (mqttClient) { mqttClient.end(true); mqttClient = null }
    if (mockHandle) { stopMockDrives(mockHandle); mockHandle = null }
    set({ connected: false })
  }
}))

// ─── Selectors (memo-friendly: derive in component with useMemo) ───
export function selectDriveList(drives: Map<string, Drive>): Drive[] {
  return Array.from(drives.values()).sort((a, b) => a.index - b.index)
}

export function selectMeterList(meters: Map<string, Meter>): Meter[] {
  return Array.from(meters.values())
}

export function computeStats(drives: Map<string, Drive>): Stats {
  let total = 0, online = 0, running = 0, faults = 0
  const faultTexts: string[] = []
  for (const d of drives.values()) {
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
}

export type { Stats }
