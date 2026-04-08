import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import mqtt from 'mqtt'
import { startMockDrives, stopMockDrives } from '../mock/drives.js'

// Mode: 'mock' for local dev, 'mqtt' for production (real broker)
const MODE = import.meta.env.VITE_DATA_MODE || 'mock'
const MQTT_URL = import.meta.env.VITE_MQTT_URL || `ws://${window.location.hostname}:9001`

export const useDrivesStore = defineStore('drives', () => {
  // Map<name, driveData>
  const drives = ref(new Map())
  const meters = ref(new Map())
  const connected = ref(false)
  const mode = ref(MODE)

  let client = null
  let mockHandle = null

  function upsertDrive(d) {
    if (!d || !d.name) return
    drives.value.set(d.name, { ...d, _rx: Date.now() })
  }

  function upsertMeter(m) {
    if (!m || !m.name) return
    meters.value.set(m.name, { ...m, _rx: Date.now() })
  }

  function connect() {
    if (mode.value === 'mock') {
      mockHandle = startMockDrives({
        onDrive: upsertDrive,
        onMeter: upsertMeter
      })
      connected.value = true
      return
    }

    // Real MQTT
    client = mqtt.connect(MQTT_URL, {
      clientId: 'weg-spa-' + Math.random().toString(16).substr(2, 8),
      reconnectPeriod: 2000
    })
    client.on('connect', () => {
      connected.value = true
      client.subscribe(['weg/drives/+', 'weg/meters/+'])
    })
    client.on('close', () => { connected.value = false })
    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString())
        if (topic.startsWith('weg/drives/')) upsertDrive(data)
        else if (topic.startsWith('weg/meters/')) upsertMeter(data)
      } catch (e) { /* ignore parse errors */ }
    })
  }

  function disconnect() {
    if (client) { client.end(true); client = null }
    if (mockHandle) { stopMockDrives(mockHandle); mockHandle = null }
    connected.value = false
  }

  // Sorted list by index for stable rendering
  const driveList = computed(() =>
    Array.from(drives.value.values()).sort((a, b) => (a.index || 0) - (b.index || 0))
  )
  const meterList = computed(() => Array.from(meters.value.values()))

  // Aggregate banner stats
  const stats = computed(() => {
    let total = 0, online = 0, running = 0, faults = 0
    const faultTexts = []
    for (const d of drives.value.values()) {
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
    let color, icon, text
    if (faults > 0) { color = '#ef4444'; icon = 'mdi-alert'; text = faultTexts.join(' | ') }
    else if (running > 0) { color = '#3b82f6'; icon = 'mdi-lightning-bolt'; text = `${running}/${online} DRIVES EN MARCHA` }
    else if (online > 0) { color = '#22c55e'; icon = 'mdi-check-circle'; text = `${online}/${total} DRIVES ONLINE` }
    else { color = '#f59e0b'; icon = 'mdi-loading'; text = 'CONECTANDO...' }
    return { total, online, running, faults, color, icon, text, offline: total - online }
  })

  return {
    drives, meters, driveList, meterList, connected, mode, stats,
    connect, disconnect
  }
})
