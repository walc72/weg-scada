import type { Drive, Meter, DriveType } from '../types'

interface SeedDrive {
  name: string
  type: DriveType
  site: string
  index: number
  baseRPM?: number
  baseI?: number
  baseV?: number
  offline?: boolean
  fault?: boolean
}

const SEED_DRIVES: SeedDrive[] = [
  { name: 'SAER 1', type: 'CFW900', site: 'Agriplus', index: 0, baseRPM: 1450, baseI: 78,  baseV: 395 },
  { name: 'SAER 2', type: 'CFW900', site: 'Agriplus', index: 1, baseRPM: 1380, baseI: 82,  baseV: 392 },
  { name: 'SAER 3', type: 'CFW900', site: 'Agriplus', index: 2, offline: true },
  { name: 'SAER 4', type: 'CFW900', site: 'Agriplus', index: 3, baseRPM: 1500, baseI: 75,  baseV: 398 },
  { name: 'SAER 8', type: 'SSW900', site: 'Agriplus', index: 4, baseI: 480, baseV: 395 },
  { name: 'SAER 5', type: 'SSW900', site: 'Agriplus', index: 5, fault: true },
  { name: 'SSW900 Agrocaraya', type: 'SSW900', site: 'Agrocaraya', index: 6, offline: true }
]

const PM8000_BASE  = { name: 'PM8000',   voltage: 24350, current: 28.4,  power: 1180000, pf: 0.987 }
const PM8000_2     = { name: 'PM8000 #2', voltage: 24100, current: 15.2,  power:  620000, pf: 0.975 }
const PM8000_3     = { name: 'PM8000 #3', voltage: 24200, current: 22.8,  power:  940000, pf: 0.982 }
const PM8000_4     = { name: 'PM8000 #4', voltage: 23900, current:  9.6,  power:  380000, pf: 0.961 }

// Smooth random walk: nudge current value a small step toward target range
function nudge(current: number, base: number, pct = 0.05, step = 0.15): number {
  if (!base) return 0
  const lo = base * (1 - pct)
  const hi = base * (1 + pct)
  // small random delta ± 2% of base per tick
  const delta = base * 0.02 * (Math.random() * 2 - 1)
  let next = current + delta
  // soft clamp: pull back toward range if outside
  if (next < lo) next += (lo - next) * step
  if (next > hi) next -= (next - hi) * step
  return next
}

interface DriveState {
  running: boolean
  rpm: number; current: number; voltage: number
  frequency: number; cosPhi: number
  igbt0: number; igbt1: number; igbt2: number; scrTemp: number
}

const driveState = new Map<string, DriveState>()

function getOrInitState(seed: SeedDrive): DriveState {
  if (driveState.has(seed.name)) return driveState.get(seed.name)!
  const offline = !!seed.offline
  const fault = !!seed.fault
  const running = !offline && !fault
  const s: DriveState = {
    running,
    rpm: running ? (seed.baseRPM || 0) : 0,
    current: running ? (seed.baseI || 0) : 0,
    voltage: !offline ? (seed.baseV || 0) : 0,
    frequency: running ? 50 : 0,
    cosPhi: running ? 0.92 : 0,
    igbt0: running ? 55 : 26,
    igbt1: running ? 56 : 26,
    igbt2: running ? 54 : 26,
    scrTemp: running ? 45 : 28,
  }
  driveState.set(seed.name, s)
  return s
}

function makeDrive(seed: SeedDrive): Drive {
  const isCFW = seed.type === 'CFW900'
  const offline = !!seed.offline
  const fault = !!seed.fault

  const s = getOrInitState(seed)

  if (!offline && !fault) {
    s.rpm      = nudge(s.rpm,      seed.baseRPM || 0, 0.03)
    s.current  = nudge(s.current,  seed.baseI   || 0, 0.06)
    s.voltage  = nudge(s.voltage,  seed.baseV   || 0, 0.015)
    s.frequency = nudge(s.frequency, 50, 0.015)
    s.cosPhi   = nudge(s.cosPhi,   0.92, 0.015)
    s.igbt0    = nudge(s.igbt0, s.running ? 55 : 26, 0.08)
    s.igbt1    = nudge(s.igbt1, s.running ? 56 : 26, 0.08)
    s.igbt2    = nudge(s.igbt2, s.running ? 54 : 26, 0.08)
    s.scrTemp  = nudge(s.scrTemp,  s.running ? 45 : 28, 0.08)
  }

  const running = s.running
  const motorSpeed = running ? Math.round(s.rpm) : 0
  const current    = running ? +s.current.toFixed(1) : 0
  const voltage    = !offline ? +s.voltage.toFixed(0) : 0
  const frequency  = isCFW && running ? +s.frequency.toFixed(1) : 0
  const power      = running ? +(current * voltage * 0.0017).toFixed(2) : 0
  const igbtTemps  = isCFW ? [+s.igbt0.toFixed(1), +s.igbt1.toFixed(1), +s.igbt2.toFixed(1)] : [0, 0, 0]

  return {
    name: seed.name,
    displayName: seed.name,
    type: seed.type,
    site: seed.site,
    index: seed.index,
    online: !offline,
    running,
    ready: !offline && !running && !fault,
    fault,
    hasFault: fault,
    hasAlarm: false,
    stateCode: fault ? 2 : (running ? 1 : 0),
    statusText: fault ? 'FAULT' : (running ? 'RUNNING' : (offline ? 'OFFLINE' : 'READY')),
    motorSpeed,
    speedRef: isCFW ? Math.round(s.rpm) : 0,
    current,
    outputCurrent: current,
    frequency,
    outputFreq: frequency,
    outputVoltage: voltage,
    power,
    cosPhi: running ? +s.cosPhi.toFixed(2) : 0,
    motorTemp: 0,
    igbtTemp: Math.max(...igbtTemps),
    igbtTemps,
    scrTemp: !isCFW && !offline ? +s.scrTemp.toFixed(1) : 0,
    nominalCurrent: 150,
    nominalVoltage: 500,
    nominalFreq: isCFW ? 70 : 0,
    hoursEnergized: ((seed.index + 1) * 1234.5).toFixed(1),
    hoursEnabled:   ((seed.index + 1) * 987.3).toFixed(1),
    faultText: fault ? 'FALLA' : 'Sin Falla',
    alarmText: '',
    commErrors: 0,
    runHours: 0,
    enabled: true
  }
}

const METER_SEEDS = [PM8000_BASE, PM8000_2, PM8000_3, PM8000_4]

interface MeterState { voltage: number; current: number; power: number; pf: number }
const meterState = new Map<string, MeterState>()

function makeMeter(seed: typeof PM8000_BASE): Meter {
  if (!meterState.has(seed.name)) {
    meterState.set(seed.name, { voltage: seed.voltage, current: seed.current, power: seed.power, pf: seed.pf })
  }
  const s = meterState.get(seed.name)!
  s.voltage = nudge(s.voltage, seed.voltage, 0.005)
  s.current = nudge(s.current, seed.current, 0.03)
  s.power   = nudge(s.power,   seed.power,   0.04)
  s.pf      = nudge(s.pf,      seed.pf,      0.005)
  return {
    name: seed.name,
    type: 'PM8000',
    ip: '192.168.10.60',
    online: true,
    voltage: +s.voltage.toFixed(2),
    current: +s.current.toFixed(2),
    power:   +s.power.toFixed(0),
    pf:      +s.pf.toFixed(4),
    _ts: Date.now()
  }
}

export interface MockHandle { id: ReturnType<typeof setInterval> }

export function startMockDrives(opts: {
  onDrive: (d: Drive) => void
  onMeter: (m: Meter) => void
  intervalMs?: number
}): MockHandle {
  const { onDrive, onMeter, intervalMs = 2000 } = opts
  SEED_DRIVES.forEach(s => onDrive(makeDrive(s)))
  METER_SEEDS.forEach(s => onMeter(makeMeter(s)))
  const id = setInterval(() => {
    SEED_DRIVES.forEach(s => onDrive(makeDrive(s)))
    METER_SEEDS.forEach(s => onMeter(makeMeter(s)))
  }, intervalMs)
  return { id }
}

export function stopMockDrives(handle: MockHandle | null) {
  if (handle && handle.id) clearInterval(handle.id)
  driveState.clear()
  meterState.clear()
}
