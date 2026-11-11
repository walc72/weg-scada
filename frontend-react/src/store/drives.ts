import { create } from 'zustand'
import mqtt, { MqttClient } from 'mqtt'
import type { Drive, Meter, FlowmeterState, CommState, CampoState } from '../types'
import { startMockDrives, stopMockDrives, MockHandle } from '../mock/drives'
import { useAuthStore, authFetch } from './auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
// MQTT websocket proxeado por nginx en /mqtt (el broker ya no expone el puerto 9001)
const MQTT_URL = (import.meta.env.VITE_MQTT_URL as string) ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/mqtt`
const MAX_HISTORY = 90  // ~3 minutes at 2s interval
export { STALE_MS, isStale } from '../lib/stale'

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
  flow?: number    // m³/h, solo si la bomba lo informa
}

export interface FlowPoint { ts: number; flow?: number }

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
  alarms: number
  offline: number
  color: string
  icon: string
  text: string
}

export interface ReplicaStatus {
  lastSync: number | null
  lagSec: number | null
  live: boolean
  error: string | null
  configured?: boolean
  source?: string | null
}

// Equipos de campo: reconectadores, reguladores y generadores
const CAMPO_TOPIC = /^weg\/(reco|reg|gen)\//

interface DrivesState {
  drives: Map<string, Drive>
  meters: Map<string, Meter>
  driveHistory: Map<string, HistoryPoint[]>
  meterHistory: Map<string, MeterPoint[]>
  flowmeters: Map<string, FlowmeterState>
  flowHistory: Map<string, FlowPoint[]>
  comms: Map<string, CommState>
  campo: Map<string, CampoState>
  connected: boolean
  // Pasó la primera vuelta de datos tras conectar: antes, los contadores (18/20 OK, en marcha,
  // potencia total) se muestran «—» en vez de subir de a uno mientras llegan los equipos
  listo: boolean
  replicaStatus: ReplicaStatus | null
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
    stateCode: d.stateCode,
    flow: d.flow
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

function pushFlowHistory(map: Map<string, FlowPoint[]>, f: FlowmeterState): Map<string, FlowPoint[]> {
  const next = new Map(map)
  const arr = next.get(f.name) ?? []
  const point: FlowPoint = { ts: Date.now(), flow: f.online && !f.error && f.flow != null ? f.flow : undefined }
  next.set(f.name, arr.length >= MAX_HISTORY ? [...arr.slice(1), point] : [...arr, point])
  return next
}

// Mensajes en vivo en lote: se acumulan y se aplican al store juntos cada LOTE_MS. Antes cada
// mensaje (uno por equipo, ~20 cada 2 s) era un render aparte de todo lo que mira el store, y en
// Tendencias eso redibujaba los gráficos de 24 h decenas de veces por segundo.
const LOTE_MS = 300
type Lote = { drives: Drive[]; meters: Meter[]; flows: FlowmeterState[]; comms: CommState[]; campo: CampoState[] }
const loteVacio = (): Lote => ({ drives: [], meters: [], flows: [], comms: [], campo: [] })
let lote = loteVacio()
let loteTimer: ReturnType<typeof setTimeout> | null = null
function encolar<K extends keyof Lote>(k: K, d: Lote[K][number]) {
  (lote[k] as Lote[K][number][]).push(d)
  if (!loteTimer) loteTimer = setTimeout(aplicarLote, LOTE_MS)
}
function aplicarLote() {
  if (loteTimer) clearTimeout(loteTimer)
  loteTimer = null
  const l = lote
  lote = loteVacio()
  const st = useDrivesStore.getState()
  const upd: Partial<DrivesState> = {}
  if (l.drives.length) {
    const drives = new Map(st.drives); let h = st.driveHistory
    for (const d of l.drives) { drives.set(d.name, d); h = pushDriveHistory(h, d) }
    upd.drives = drives; upd.driveHistory = h
  }
  if (l.meters.length) {
    const meters = new Map(st.meters); let h = st.meterHistory
    for (const m of l.meters) { meters.set(m.name, m); h = pushMeterHistory(h, m) }
    upd.meters = meters; upd.meterHistory = h
  }
  if (l.flows.length) {
    const flowmeters = new Map(st.flowmeters); let h = st.flowHistory
    for (const f of l.flows) { flowmeters.set(f.name, f); h = pushFlowHistory(h, f) }
    upd.flowmeters = flowmeters; upd.flowHistory = h
  }
  if (l.comms.length) { const comms = new Map(st.comms); for (const c of l.comms) comms.set(c.name, c); upd.comms = comms }
  if (l.campo.length) { const campo = new Map(st.campo); for (const c of l.campo) campo.set(c.name, c); upd.campo = campo }
  if (Object.keys(upd).length) useDrivesStore.setState(upd)
}
function descartarLote() {
  if (loteTimer) clearTimeout(loteTimer)
  loteTimer = null
  lote = loteVacio()
}

const LISTO_MS = 3000

export const useDrivesStore = create<DrivesState>((set, get) => ({
  drives: new Map(),
  meters: new Map(),
  driveHistory: new Map(),
  meterHistory: new Map(),
  flowmeters: new Map(),
  flowHistory: new Map(),
  comms: new Map(),
  campo: new Map(),
  connected: false,
  listo: false,
  replicaStatus: null,
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
    // una vuelta de sondeo del poller (2 s) con margen; no se vuelve a ocultar al reconectar
    if (!get().listo) setTimeout(() => set({ listo: true }), LISTO_MS)
    const ms = intervalMs ?? get().refreshMs
    if (get().mode === 'mock') {
      mockHandle = startMockDrives({
        intervalMs: ms,
        onDrive: (d) => { d._ts = Date.now(); encolar('drives', d) },
        onMeter: (m) => { m._ts = Date.now(); encolar('meters', m) },
        onFlow: (f) => { f.ts = Date.now(); encolar('flows', f) },
        onCampo: (c) => { c._ts = Date.now(); encolar('campo', c) }
      })
      // Enlaces de muestra (estáticos): un PtP en línea, un RUT en línea y otro caído
      const t = Date.now()
      set({ connected: true, comms: new Map<string, CommState>([
        ['PtP Agriplus', { name: 'PtP Agriplus', tipo: 'airmax', online: true, desde: t - 86400_000, signal: -58, noise: -92, quality: 96, txMbps: 130, rxMbps: 117, remoto: 'AGRI-PTP', freqMhz: 5745, anchoMhz: 20, remotoNombre: 'PtP Bombeo', remotoIp: '192.168.10.3', remotoSignal: -61, remotoNoise: -90, distanciaM: 3200, capTxMbps: 98.4, capRxMbps: 91.2, trafTxMbps: 0.42, trafRxMbps: 1.35, uptime: 1_036_800 }],
        ['RUT Agrocaraya', { name: 'RUT Agrocaraya', tipo: 'rut', online: true, desde: t - 7200_000, signal: -79, operador: 'Tigo', red: '4G', uptime: 259_200 }],
        ['RUT Colector Norte', { name: 'RUT Colector Norte', tipo: 'rut', online: false, desde: t - 23 * 60_000 }],
      ]) })
      return
    }

    // /mqtt exige token de sesión (lo valida weg-api); sin sesión no se conecta
    const token = useAuthStore.getState().token
    if (!token) return
    const url = new URL(MQTT_URL)
    url.searchParams.set('token', token)  // respeta una VITE_MQTT_URL que ya traiga query
    mqttClient = mqtt.connect(url.toString(), {
      clientId: 'weg-react-' + Math.random().toString(16).slice(2, 10),
      reconnectPeriod: 2000
    })
    let failStreak = 0
    mqttClient.on('connect', () => {
      failStreak = 0
      set({ connected: true })
      mqttClient?.subscribe(['weg/drives/+', 'weg/meters/+', 'weg/flow/+', 'weg/comm/+', 'weg/reco/+', 'weg/reg/+', 'weg/gen/+', 'weg/replica/status'])
    })
    mqttClient.on('close', () => {
      set({ connected: false })
      // Tras 3 intentos fallidos seguidos, chequear la sesión: si venció o se
      // cerró, authFetch recibe 401 y hace logout → se corta el bucle de
      // reintentos (que si no seguiría pegándole a /mqtt con un token muerto).
      failStreak++
      if (failStreak % 3 === 0 && useAuthStore.getState().token) {
        authFetch(`${API_BASE}/me`).catch(() => { /* sin red: sigue reintentando */ })
      }
    })
    mqttClient.on('message', (topic, payload) => {
      // Payload vacío = retenido borrado (equipo eliminado o desactivado): sacarlo
      // (el tópico lleva el nombre con # + / y espacios cambiados por _, como el poller)
      if (payload.length === 0) {
        aplicarLote()   // lo encolado antes no debe revivir al equipo borrado
        const suffix = topic.split('/').slice(2).join('/')
        const matches = (k: string) => k.replace(/[# +/]/g, '_') === suffix
        if (topic.startsWith('weg/drives/')) {
          const k = [...get().drives.keys()].find(matches)
          if (k) { const drives = new Map(get().drives); drives.delete(k); set({ drives }) }
        } else if (topic.startsWith('weg/meters/')) {
          const k = [...get().meters.keys()].find(matches)
          if (k) { const meters = new Map(get().meters); meters.delete(k); set({ meters }) }
        } else if (topic.startsWith('weg/flow/')) {
          const k = [...get().flowmeters.keys()].find(matches)
          if (k) { const flowmeters = new Map(get().flowmeters); flowmeters.delete(k); set({ flowmeters }) }
        } else if (topic.startsWith('weg/comm/')) {
          const k = [...get().comms.keys()].find(matches)
          if (k) { const comms = new Map(get().comms); comms.delete(k); set({ comms }) }
        } else if (CAMPO_TOPIC.test(topic)) {
          const k = [...get().campo.keys()].find(matches)
          if (k) { const campo = new Map(get().campo); campo.delete(k); set({ campo }) }
        }
        return
      }
      try {
        const data = JSON.parse(payload.toString())
        if (topic.startsWith('weg/drives/')) {
          data._ts = Date.now()
          encolar('drives', data)
        } else if (topic.startsWith('weg/meters/')) {
          data._ts = Date.now()
          encolar('meters', data)
        } else if (topic.startsWith('weg/flow/')) {
          data.ts = Date.now()   // hora de llegada (como _ts de bombas): evita desfasaje de reloj con el server
          encolar('flows', data)
        } else if (topic.startsWith('weg/comm/')) {
          data._ts = Date.now()
          encolar('comms', data)
        } else if (CAMPO_TOPIC.test(topic)) {
          data._ts = Date.now()   // hora de llegada (CampoState.ts es la del server)
          encolar('campo', data)
        } else if (topic === 'weg/replica/status') {
          set({ replicaStatus: data as ReplicaStatus })
        }
      } catch (e) { console.debug('[MQTT] Failed to parse message:', e) }
    })
  },

  disconnect: () => {
    if (mqttClient) { mqttClient.end(true); mqttClient = null }
    if (mockHandle) { stopMockDrives(mockHandle); mockHandle = null }
    descartarLote()
    set({ connected: false })
  }
}))

// ─── Selectors (memo-friendly: derive in component with useMemo) ───
// Orden por sitio y nombre con números naturales (SAER 2 antes que SAER 10),
// no por la posición en config.json, que queda mezclada al agregar equipos.
export const byName = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
export function selectDriveList(drives: Map<string, Drive>): Drive[] {
  return Array.from(drives.values()).sort((a, b) =>
    byName.compare(a.site || '', b.site || '') || byName.compare(a.name, b.name))
}

export function selectMeterList(meters: Map<string, Meter>): Meter[] {
  return Array.from(meters.values())
}

// Razones de alarma por setpoint (corriente/temp/comm sobre umbral), con el
// valor medido y el límite, para mostrar texto legible en vez de un código.
export function spAlarmReasons(d: Drive): string[] {
  const out: string[] = []
  if (d.alarmCurrentHigh) out.push(`Corriente alta ${Math.round(d.current)}A (>${d.spCurrentHigh})`)
  if (d.alarmTempHigh) {
    const t = d.type === 'SSW900' ? d.scrTemp : d.igbtTemp
    out.push(`Temp alta ${Math.round(t || 0)}°C (>${d.spTempHigh})`)
  }
  if (d.alarmCommHigh) out.push(`Errores comm ${d.commErrors} (>${d.spCommErrorMax})`)
  return out
}

// ¿El drive tiene alguna alarma (interna del drive o por setpoint)?
export function driveHasAnyAlarm(d: Drive): boolean {
  return !!(d.hasAlarm || d.hasAlarmSp)
}

// Texto combinado de alarmas: la interna del drive + las de setpoint.
export function driveAlarmLabel(d: Drive): string {
  const parts: string[] = []
  if (d.hasAlarm) parts.push(d.alarmText || 'alarma')
  parts.push(...spAlarmReasons(d))
  return parts.join(', ')
}

export function computeStats(drives: Map<string, Drive>): Stats {
  let total = 0, online = 0, running = 0, faults = 0, alarms = 0
  const faultTexts: string[] = []
  const alarmTexts: string[] = []
  for (const d of drives.values()) {
    if (d.fueraServicio) continue  // ni cuenta para «x/y OK» ni alarma
    total++
    if (d.online) {
      online++
      if (d.running) running++
      if (d.hasFault) {
        faults++
        faultTexts.push(`${d.displayName || d.name}: ${d.faultText}`)
      }
      if (driveHasAnyAlarm(d)) {
        alarms++
        alarmTexts.push(`${d.displayName || d.name}: ${driveAlarmLabel(d)}`)
      }
    }
  }
  let color: string, icon: string, text: string
  if (faults > 0) {
    color = '#ef4444'; icon = 'alert'; text = faultTexts.join(' | ')
  } else if (alarms > 0) {
    color = '#f59e0b'; icon = 'alert'; text = alarmTexts.join(' | ')
  } else if (online > 0) {
    // Sin números: la cantidad en marcha / total la muestra el indicador del banner
    color = running > 0 ? '#3b82f6' : '#22c55e'; icon = running > 0 ? 'bolt' : 'check'
    text = 'OPERACIÓN NORMAL · SIN FALLAS NI ALARMAS'
  } else {
    color = '#f59e0b'; icon = 'loader'; text = 'CONECTANDO...'
  }
  return { total, online, running, faults, alarms, offline: total - online, color, icon, text }
}

export type { Stats }
