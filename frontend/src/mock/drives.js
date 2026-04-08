// Mock drives + PM8000 generator. Mimics the real poller payload shape.

const SEED_DRIVES = [
  { name: 'SAER 1', type: 'CFW900', site: 'Agriplus', index: 0, baseRPM: 1450, baseI: 78,  baseV: 395 },
  { name: 'SAER 2', type: 'CFW900', site: 'Agriplus', index: 1, baseRPM: 1380, baseI: 82,  baseV: 392 },
  { name: 'SAER 3', type: 'CFW900', site: 'Agriplus', index: 2, baseRPM: 0,    baseI: 0,   baseV: 0,   offline: true },
  { name: 'SAER 4', type: 'CFW900', site: 'Agriplus', index: 3, baseRPM: 1500, baseI: 75,  baseV: 398 },
  { name: 'SAER 8', type: 'SSW900', site: 'Agriplus', index: 4, baseRPM: 0,    baseI: 480, baseV: 395 },
  { name: 'SAER 5', type: 'SSW900', site: 'Agriplus', index: 5, baseRPM: 0,    baseI: 0,   baseV: 0,   fault: true },
  { name: 'SSW900 Agrocaraya', type: 'SSW900', site: 'Agrocaraya', index: 6, offline: true }
]

const PM8000_BASE = { voltage: 24350, current: 28.4, power: 1180000, pf: 0.987 }

function jitter(base, pct = 0.05) {
  if (!base) return 0
  return base + base * pct * (Math.random() * 2 - 1)
}

function makeDrive(seed) {
  const isCFW = seed.type === 'CFW900'
  const offline = !!seed.offline
  const fault = !!seed.fault
  const running = !offline && !fault && Math.random() > 0.4
  const motorSpeed = running ? Math.round(jitter(seed.baseRPM, 0.03)) : 0
  const current = running ? +jitter(seed.baseI, 0.08).toFixed(1) : 0
  const voltage = !offline ? +jitter(seed.baseV, 0.02).toFixed(0) : 0
  const frequency = isCFW && running ? +jitter(50, 0.02).toFixed(1) : 0
  const power = running ? +(current * voltage * 0.0017).toFixed(2) : 0
  const igbtTemps = isCFW ? [
    +jitter(running ? 55 : 26, 0.1).toFixed(1),
    +jitter(running ? 56 : 26, 0.1).toFixed(1),
    +jitter(running ? 54 : 26, 0.1).toFixed(1)
  ] : [0, 0, 0]

  return {
    name: seed.name, type: seed.type, site: seed.site, index: seed.index,
    displayName: seed.name,
    online: !offline,
    running, ready: !offline && !running && !fault,
    fault, hasFault: fault, hasAlarm: false,
    stateCode: fault ? 2 : (running ? 1 : 0),
    statusText: fault ? 'FAULT' : (running ? 'RUNNING' : (offline ? 'OFFLINE' : 'READY')),
    motorSpeed, speedRef: isCFW ? Math.round(jitter(1450, 0.01)) : 0,
    current, outputCurrent: current,
    frequency, outputFreq: frequency,
    outputVoltage: voltage,
    power, cosPhi: running ? +jitter(0.92, 0.02).toFixed(2) : 0,
    motorTemp: 0,
    igbtTemp: Math.max(...igbtTemps),
    igbtTemps,
    scrTemp: !isCFW && !offline ? +jitter(running ? 45 : 28, 0.1).toFixed(1) : 0,
    nominalCurrent: 150, nominalVoltage: 500, nominalFreq: isCFW ? 70 : 0,
    hoursEnergized: ((seed.index + 1) * 1234.5).toFixed(1),
    hoursEnabled:   ((seed.index + 1) * 987.3).toFixed(1),
    faultText: fault ? 'FALLA' : 'Sin Falla',
    alarmText: '',
    commErrors: 0,
    runHours: 0
  }
}

function makePm8000() {
  return {
    name: 'PM8000', type: 'PM8000', ip: '192.168.10.60',
    online: true,
    voltage: +jitter(PM8000_BASE.voltage, 0.005).toFixed(2),
    current: +jitter(PM8000_BASE.current, 0.04).toFixed(2),
    power:   +jitter(PM8000_BASE.power,   0.06).toFixed(0),
    pf:      +jitter(PM8000_BASE.pf,      0.005).toFixed(4),
    uiConfig: {
      title: 'Medición Línea Exclusiva',
      zones: {
        voltage: { min: 0, max: 36, green: 33, yellow: 34.5 },
        current: { min: 0, max: 200, green: 120, yellow: 170 },
        power:   { min: 0, max: 2000, green: 1500, yellow: 1800 },
        pf:      { min: 0, max: 1, green: 0.85, yellow: 0.95 }
      }
    },
    _ts: Date.now()
  }
}

export function startMockDrives({ onDrive, onMeter, intervalMs = 2000 } = {}) {
  // Initial burst
  SEED_DRIVES.forEach(s => onDrive(makeDrive(s)))
  onMeter(makePm8000())

  const id = setInterval(() => {
    SEED_DRIVES.forEach(s => onDrive(makeDrive(s)))
    onMeter(makePm8000())
  }, intervalMs)
  return { id }
}

export function stopMockDrives(handle) {
  if (handle && handle.id) clearInterval(handle.id)
}
