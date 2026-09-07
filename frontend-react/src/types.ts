export type DriveType = 'CFW900' | 'SSW900'

export interface Drive {
  name: string
  displayName?: string
  type: DriveType
  site: string
  index: number
  online: boolean
  running: boolean
  ready: boolean
  fault: boolean
  hasFault: boolean
  hasAlarm: boolean
  stateCode: number
  statusText: string
  motorSpeed: number
  speedRef: number
  current: number
  outputCurrent: number
  frequency: number
  outputFreq: number
  outputVoltage: number
  power: number
  cosPhi: number
  motorTemp: number
  igbtTemp: number
  igbtTemps: number[]
  scrTemp: number
  nominalCurrent: number
  nominalVoltage: number
  nominalFreq: number
  hoursEnergized: string
  hoursEnabled: string
  faultText: string
  alarmText: string
  commErrors: number
  runHours: number
  enabled?: boolean
}

export interface MeterZone {
  min: number
  max: number
  green: number
  yellow: number
  redLow?: number
}

export interface MeterUiConfig {
  title?: string
  zones: {
    voltage: MeterZone
    current: MeterZone
    power: MeterZone
    pf: MeterZone
  }
}

export interface Meter {
  name: string
  type: 'PM8000' | 'PM7400'
  ip: string
  online: boolean
  voltage: number
  current: number
  power: number
  pf: number
  frequency?: number
  uiConfig?: MeterUiConfig
  _ts?: number
}

// ─── Forma de onda (armonicos de medidores PM) ───
export interface WaveformConfig {
  freqReg?: number
  numHarmonics?: number
  channels?: Record<string, number>  // canal -> registro base (1-based)
}

// [amplitud, fase en grados] por armonico, indexado desde el armonico 1
export type Harmonic = [number, number]

export interface WaveformData {
  name: string
  ip?: string
  freq: number
  numHarmonics: number
  ts: number
  channels: Record<string, { harmonics: Harmonic[] }>
}

export interface DeviceConfig {
  name: string
  type: DriveType
  site: string
  ip: string
  port: number
  unitId: number
  enabled?: boolean
  regOffset?: number      // SSW900 via PLC: offset de registros de datos
  statusOffset?: number   // SSW900 via PLC: offset de registros de estado
}

export interface GatewayConfig {
  name: string
  ip: string
  port: number
  site: string
}

export interface AppConfig {
  devices: DeviceConfig[]
  gateways: GatewayConfig[]
  meters: Array<{
    name: string
    type: string
    ip: string
    port: number
    unitId: number
    enabled?: boolean
    regs: { voltage: number; current: number; power: number; pf: number }
    ui?: MeterUiConfig
    waveform?: WaveformConfig
  }>
  gaugeZones?: Record<string, Record<string, { min: number; max: number; green: number; yellow: number; redLow?: number }>>
  meterNames?: Record<string, string>  // key = meter.name, value = display name
}
