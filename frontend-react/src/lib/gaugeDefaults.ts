export type GaugeKey = 'velocidad' | 'corriente' | 'tension' | 'frecuencia'

export interface GaugeZone {
  min: number
  max: number
  green: number
  yellow: number
  redLow?: number
}

export const GAUGE_DEFAULTS: Record<string, Record<GaugeKey, GaugeZone>> = {
  CFW900: {
    velocidad:  { min: 0, max: 1800, green: 1200, yellow: 1500 },
    corriente:  { min: 0, max: 150,  green: 80,   yellow: 120 },
    tension:    { min: 0, max: 500,  redLow: 350, green: 380, yellow: 480 },
    frecuencia: { min: 0, max: 70,   green: 50,   yellow: 62 },
  },
  SSW900: {
    velocidad:  { min: 0, max: 1800, green: 1200, yellow: 1500 }, // unused for SSW
    corriente:  { min: 0, max: 800,  green: 500,  yellow: 700 },
    tension:    { min: 0, max: 500,  redLow: 350, green: 380, yellow: 480 },
    frecuencia: { min: 0, max: 70,   green: 50,   yellow: 62 },  // unused for SSW
  },
}

/** Merge saved config zones (partial) over defaults for a given drive type + gauge key */
export function resolveZone(
  driveType: string,
  gaugeKey: GaugeKey,
  saved?: Partial<GaugeZone>
): GaugeZone {
  const def = GAUGE_DEFAULTS[driveType]?.[gaugeKey] ?? GAUGE_DEFAULTS.CFW900[gaugeKey]
  return { ...def, ...saved }
}
