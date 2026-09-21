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
  dcLink?: number   // CFW: tensión del bus DC (Vdc, P0004)
  torque?: number   // CFW: torque en el motor (%, P0009)
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
  _ts?: number   // marca de recepción (para detección de datos viejos/stale)
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
  reactive?: number
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
  // SSW900 via PLC: preferido referenciar un slot del gateway (gateway + slot).
  gateway?: string        // nombre del gateway PLC
  slot?: number           // id de slot dentro del gateway (ver GatewaySlot.id)
  // Fallback/override: offsets crudos (si están, ganan sobre el slot)
  regOffset?: number      // offset de registros de datos
  statusOffset?: number   // offset de registros de estado
}

// Slot de un PLC gateway: mapea un id a los offsets Modbus de ese drive.
// El mapa de memoria del PLC es una propiedad del gateway, no del device.
export interface GatewaySlot {
  id: number
  regOffset: number
  statusOffset: number
  label?: string
}

export type GatewayKind = 'plc' | 'adam'

// Layout del mapa %MW del PLC, usado por el escaneo automático. Configurable
// por gateway para adaptarse a cualquier programa de PLC (no solo el de Agriplus).
export interface GatewayScanCfg {
  regsPerDrive: number   // registros de datos por drive (bloque de mediciones)
  statusBase: number     // %MW donde arranca el bloque de estado del primer drive
  statusStride: number   // registros de estado por drive
  maxSlots: number       // cuántos slots barre el scan
}

export const DEFAULT_GATEWAY_SCAN: GatewayScanCfg = { regsPerDrive: 70, statusBase: 140, statusStride: 12, maxSlots: 6 }

export interface GatewayConfig {
  name: string
  ip: string
  port: number
  site: string
  // Tipo de pasarela: 'plc' (concentrador M241: drives por offset/slot) o
  // 'adam' (RS-485↔TCP: cada drive es un esclavo Modbus por Unit ID).
  kind?: GatewayKind
  slots?: GatewaySlot[]   // solo PLC: tabla de slots (id -> offsets)
  scan?: GatewayScanCfg   // solo PLC: layout para el escaneo automático
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
    site?: string
    regs: { voltage: number; current: number; power: number; pf: number; reactive?: number; freq?: number }
    ui?: MeterUiConfig
    waveform?: WaveformConfig
  }>
  gaugeZones?: Record<string, Record<string, { min: number; max: number; green: number; yellow: number; redLow?: number }>>
  meterNames?: Record<string, string>  // key = meter.name, value = display name
  alarmSetpoints?: {
    defaults?: Record<string, Record<string, number>>   // por tipo (CFW900/SSW900)
    overrides?: Record<string, Record<string, number>>  // por nombre de equipo
  }
  plainGauges?: boolean   // true = apaga la coloración por umbrales; gauges en verde fijo
}
