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
  // Alarmas por setpoint (umbrales configurables, calculadas en el poller)
  alarmCurrentHigh?: boolean
  alarmTempHigh?: boolean
  alarmCommHigh?: boolean
  hasAlarmSp?: boolean
  spCurrentHigh?: number
  spTempHigh?: number
  spCommErrorMax?: number
  commErrors: number
  runHours: number
  enabled?: boolean
  _ts?: number   // marca de recepción (para detección de datos viejos/stale)
  license?: 'excedido'  // fuera de la licencia: el backend lo publica sin datos
  sinEnlace?: string  // offline porque el enlace de radio que lo une está caído (nombre del enlace)
  pollMs?: number  // cada cuánto actualiza el poller este equipo
  // Caudal (módulo caudales): flow solo cuando se conoce (m³/h)
  flow?: number
  flowMode?: 'manual' | 'real' | 'colector'
  flowMeter?: string  // colector: nombre del caudalímetro
}

// Estado en vivo de un caudalímetro (weg/flow/<nombre>, retenido)
export interface FlowmeterState {
  name: string
  flow?: number | null
  total?: number | null
  error?: number | null
  online: boolean
  ts?: number
  license?: 'excedido'
  sinEnlace?: string  // offline por enlace de radio caído (nombre del enlace)
}

// Equipos de campo (reconectadores / reguladores): punto del mapa de registros
export interface Punto {
  key: string; fc: 3 | 4; addr: number; tipo: string
  orden?: string; escala?: number; bit?: number; valor?: number; texto?: string
}

export interface CampoConfig {
  name: string; modelo: string; ip: string; port?: number; unitId?: number
  enabled?: boolean; enlace?: string; tapMin?: number; tapMax?: number
  mapa: Punto[]
}

export interface CampoState {
  name: string
  kind: 'reco' | 'reg'
  modelo: string
  online: boolean
  ts?: number
  valores: Record<string, number | boolean | null>
  alarmas: Record<string, string>
  sinEnlace?: string
  license?: 'excedido'
}

export interface FlowmeterConfig {
  name: string
  type: 'TUF2000'
  ip: string
  port: number
  unitId: number
  wordOrder?: 'LE' | 'BE'
  totalMultiplier?: number
  bombas: string[]
  enabled?: boolean
  enlace?: string  // enlace de radio (comms) por el que se llega al equipo
}

export interface CaudalConfig { modo: 'manual' | 'real'; nominal: number }

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
  license?: 'excedido'
  sinEnlace?: string  // offline por enlace de radio caído (nombre del enlace)
  pollMs?: number  // cada cuánto actualiza el poller este medidor
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
  enlace?: string  // enlace de radio (comms) por el que se llega al equipo
  // SSW900 via PLC: preferido referenciar un slot del gateway (gateway + slot).
  gateway?: string        // nombre del gateway PLC
  slot?: number           // id de slot dentro del gateway (ver GatewaySlot.id)
  // Fallback/override: offsets crudos (si están, ganan sobre el slot)
  regOffset?: number      // offset de registros de datos
  statusOffset?: number   // offset de registros de estado
  caudal?: CaudalConfig   // módulo caudales
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
  enlace?: string
}

export interface AppConfig {
  devices: DeviceConfig[]
  gateways: GatewayConfig[]
  comms?: CommConfig[]
  meters: Array<{
    name: string
    type: string
    ip: string
    port: number
    unitId: number
    enabled?: boolean
    enlace?: string
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
  // por equipo (nombre) → { gaugeKey: true }; clave '*' = todo el equipo. true = verde fijo (sin coloración por umbrales)
  plainGauges?: Record<string, Record<string, boolean>>
  // Balance/pérdida: medidor principal menos la suma de los seleccionados (pérdida = main − Σ subtract)
  lossMeter?: { main: string; subtract: string[] }
  // Medidor que se muestra por defecto como "principal" (hero) en el Dashboard
  primaryMeter?: string
  flowmeters?: FlowmeterConfig[]  // módulo caudales (TUF-2000 por PAS600)
  reconectadores?: CampoConfig[]
  reguladores?: CampoConfig[]
}

export interface License {
  installId: string | null
  ok: boolean
  motivo?: string
  cliente?: string
  modulos: string[]
  limites: Record<'A' | 'B' | 'C', number>
  uso: Record<'A' | 'B' | 'C', number>
}

// ─── Backup externo (GET /api/backup; Run: ver nodered/weg-backup/lib.sh) ───
export type BackupParte = 'config' | 'historico'
export type BackupFrecuencia = 'diaria' | 'semanal' | 'mensual' | 'desactivada'
export interface BackupProgramacion { frecuencia: BackupFrecuencia; hora: string; copias: number; configuradoEn?: string }
export interface BackupRun {
  parte: BackupParte
  inicio: string
  fin: string
  ok: boolean
  archivo: string | null
  bytes: number
  cifrado: boolean
  destinos: Record<string, string>  // local/externo/drive/sftp: "ok" | "error <msg>" | "omitido"
  error?: string
}
export interface BackupEstado {
  enCurso: { parte: BackupParte; desde: string } | null
  ultima: Partial<Record<BackupParte, BackupRun | null>>
  proxima: Partial<Record<BackupParte, string | null>>
  historial: BackupRun[]
}
export interface BackupInfo {
  modulo: boolean
  replica?: boolean
  config?: BackupProgramacion
  historico?: BackupProgramacion
  drive?: { activo: boolean; cuenta: string | null; conectado: boolean; disponible: boolean }
  sftp?: { activo: boolean; host: string; puerto: number; usuario: string; carpeta: string; huella: string | null; clavePublica: string | null }
  fraseConfigurada?: boolean
  guardado?: Record<BackupParte, boolean>  // false = no está en backup.json (se muestran los valores por defecto)
  estado?: BackupEstado | null
}
export interface BackupPrueba { destino: 'drive' | 'sftp'; ts: number; ok: boolean; error?: string; huella?: string }

// Enlace de radio (módulo Comunicaciones): antena Ubiquiti airMAX o router RUT
export interface CommConfig {
  name: string
  tipo: 'airmax' | 'rut'
  ip: string
  community?: string
  enabled?: boolean
  enlace?: string
}

// Estado en vivo de un enlace (weg/comm/<nombre>, retenido)
export interface CommState {
  name: string
  tipo?: 'airmax' | 'rut'
  online: boolean
  desde?: number            // ms epoch del último cambio de estado
  signal?: number | null
  noise?: number | null
  quality?: number | null
  txMbps?: number | null
  rxMbps?: number | null
  remoto?: string | null
  operador?: string | null
  red?: string | null
  uptime?: number | null    // segundos
  // airMAX: canal y equipo del otro extremo (primera fila de la tabla de estaciones)
  freqMhz?: number | null
  anchoMhz?: number | null
  remotoNombre?: string | null
  remotoIp?: string | null
  remotoSignal?: number | null
  remotoNoise?: number | null
  distanciaM?: number | null
  capTxMbps?: number | null
  capRxMbps?: number | null
  trafTxMbps?: number | null
  trafRxMbps?: number | null
  ts?: number
  license?: 'excedido'
}
