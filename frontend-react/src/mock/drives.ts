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

function jitter(base: number, pct = 0.05): number {
  if (!base) return 0
  return base + base * pct * (Math.random() * 2 - 1)
}

function makeDrive(seed: SeedDrive): Drive {
  const isCFW = seed.type === 'CFW900'
  const offline = !!seed.offline
  const fault = !!seed.fault
  const running = !offline && !fault && Math.random() > 0.4
  const motorSpeed = running ? Math.round(jitter(seed.baseRPM || 0, 0.03)) : 0
  const current = running ? +jitter(seed.baseI || 0, 0.08).toFixed(1) : 0
  const voltage = !offline ? +jitter(seed.baseV || 0, 0.02).toFixed(0) : 0
  const frequency = isCFW && running ? +jitter(50, 0.02).toFixed(1) : 0
  const power = running ? +(current * voltage * 0.0017).toFixed(2) : 0
  const igbtTemps = isCFW ? [
    +jitter(running ? 55 : 26, 0.1).toFixed(1),
    +jitter(running ? 56 : 26, 0.1).toFixed(1),
    +jitter(running ? 54 : 26, 0.1).toFixed(1)
  ] : [0, 0, 0]

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
    speedRef: isCFW ? Math.round(jitter(1450, 0.01)) : 0,
    current,
    outputCurrent: current,
    frequency,
    outputFreq: frequency,
    outputVoltage: voltage,
    power,
    cosPhi: running ? +jitter(0.92, 0.02).toFixed(2) : 0,
    motorTemp: 0,
    igbtTemp: Math.max(...igbtTemps),
    igbtTemps,
    scrTemp: !isCFW && !offline ? +jitter(running ? 45 : 28, 0.1).toFixed(1) : 0,
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

function makeMeter(seed: typeof PM8000_BASE): Meter {
  return {
    name: seed.name,
    type: 'PM8000',
    ip: '192.168.10.60',
    online: true,
    voltage: +jitter(seed.voltage, 0.005).toFixed(2),
    current: +jitter(seed.current, 0.04).toFixed(2),
    power:   +jitter(seed.power,   0.06).toFixed(0),
    pf:      +jitter(seed.pf,      0.005).toFixed(4),
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
}
