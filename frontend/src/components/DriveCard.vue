<template>
  <v-card :style="{ borderLeft: `4px solid ${borderColor}`, height: '100%' }"
          elevation="2" rounded="lg" class="pa-0 d-flex flex-column">
    <!-- Header -->
    <v-card-item class="pb-1">
      <template #title>
        <div class="d-flex align-center" style="gap:6px">
          <span class="font-weight-bold" style="font-size:1.1em">{{ d.displayName || d.name }}</span>
          <v-chip size="x-small" variant="tonal" :color="d.type === 'SSW900' ? 'purple' : 'blue'">{{ d.type }}</v-chip>
        </div>
      </template>
      <template #append>
        <v-chip :color="chipColor" variant="elevated" size="default" label
                style="font-weight:800; font-size:0.9em; letter-spacing:0.5px">
          <v-icon start :icon="chipIcon" />
          {{ chipText }}
        </v-chip>
      </template>
    </v-card-item>

    <v-divider />

    <!-- Gauges -->
    <div v-if="d.online" class="gauges-grid">
      <HalfGauge v-for="g in gauges" :key="g.label" v-bind="g" />
    </div>
    <div v-else class="text-center pa-6 text-grey-lighten-1">
      <v-icon size="36" color="grey-lighten-1">mdi-power-plug-off</v-icon>
      <div class="mt-1" style="font-size:0.9em">Drive sin conexión</div>
    </div>

    <!-- Metrics row -->
    <div v-if="d.online" class="metrics-grid">
      <div class="metric" style="border-left:3px solid #f59e0b">
        <div class="metric-label">Potencia</div>
        <div class="metric-value">{{ fmt(d.power) }} <span class="metric-unit">kW</span></div>
      </div>
      <div class="metric" style="border-left:3px solid #8b5cf6">
        <div class="metric-label">Cos phi</div>
        <div class="metric-value">{{ fmt(d.cosPhi) }}</div>
      </div>
      <div class="metric" :style="{ borderLeft: `3px solid ${tempBorder}` }">
        <div class="metric-label">{{ tempLabel }}</div>
        <div class="metric-value" :style="{ color: tempBorder }">
          {{ fmtT(tempVal) }} <span class="metric-unit">°C</span>
        </div>
      </div>
    </div>

    <v-alert v-if="d.hasFault" type="error" density="compact" variant="tonal" class="mx-3 mb-2">
      <strong>FALLA:</strong> {{ d.faultText }}
    </v-alert>

    <v-spacer />

    <v-card-actions v-if="d.online" class="px-4 pb-2">
      <span class="text-caption text-grey">
        <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>
        <strong v-if="d.hoursEnergized !== '-'">{{ d.hoursEnergized }}h encendido | {{ d.hoursEnabled }}h habilitado</strong>
        <span v-else>Soft Starter</span>
      </span>
      <v-spacer />
      <v-chip :color="d.hasFault ? 'red' : 'green'" variant="tonal" size="x-small" label>
        {{ d.hasFault ? d.faultText : 'Sin Falla' }}
      </v-chip>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { computed } from 'vue'
import HalfGauge from './HalfGauge.vue'

const props = defineProps({ d: { type: Object, required: true } })

const isCFW = computed(() => props.d.type !== 'SSW900')

const borderColor = computed(() => {
  const d = props.d
  if (d.running) return '#2563eb'
  if (d.ready)   return '#16a34a'
  if (d.fault)   return '#dc2626'
  if (d.online)  return '#f59e0b'
  return '#e5e7eb'
})
const chipColor = computed(() => {
  const d = props.d
  if (d.running) return 'blue'
  if (d.ready)   return 'green'
  if (d.fault)   return 'red'
  if (d.online)  return 'orange'
  return 'grey'
})
const chipIcon = computed(() => {
  const d = props.d
  if (d.running) return 'mdi-play-circle'
  if (d.ready)   return 'mdi-check-circle'
  if (d.fault)   return 'mdi-alert-circle'
  if (d.online)  return 'mdi-pause-circle'
  return 'mdi-power-plug-off'
})
const chipText = computed(() => {
  const d = props.d
  if (d.running) return 'EN MARCHA'
  if (d.ready)   return 'LISTO'
  if (d.fault)   return 'FALLA'
  if (d.online)  return 'PARADO'
  return 'OFFLINE'
})

const tempVal = computed(() => isCFW.value ? (props.d.igbtTemp || 0) : (props.d.scrTemp || 0))
const tempLabel = computed(() => isCFW.value ? 'Temp. IGBT' : 'Temp. SCR')
const tempBorder = computed(() => {
  const v = tempVal.value
  if (v > 80) return '#ef4444'
  if (v > 60) return '#f59e0b'
  return '#22c55e'
})

const gauges = computed(() => {
  const d = props.d
  const list = []
  if (isCFW.value) {
    list.push({ value: d.motorSpeed || 0, label: 'Velocidad', unit: 'RPM', min: 0, max: 1800, green: 1200, yellow: 1500 })
  }
  list.push({ value: d.current || 0, label: 'Corriente', unit: 'A', min: 0, max: 150, green: 80, yellow: 120 })
  list.push({ value: d.outputVoltage || 0, label: 'Tensión Salida', unit: 'V', min: 0, max: 500, green: 380, yellow: 480 })
  if (isCFW.value) {
    list.push({ value: d.frequency || 0, label: 'Frecuencia', unit: 'Hz', min: 0, max: 70, green: 50, yellow: 62 })
  }
  return list
})

const fmt  = v => v != null && v.toFixed ? v.toFixed(2) : '0'
const fmtT = v => v != null && v.toFixed ? v.toFixed(1) : '0'
</script>

<style scoped>
.gauges-grid {
  display: grid;
  gap: 4px;
  padding: 12px 8px 4px;
  text-align: center;
  grid-template-columns: repeat(var(--cols, 4), 1fr);
}
.gauges-grid > * { min-width: 0; }
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  padding: 4px 12px 8px;
}
.metric {
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px 10px;
}
.metric-label {
  font-size: 0.75em;
  color: #999;
  font-weight: 600;
  text-transform: uppercase;
}
.metric-value {
  font-size: 1.5em;
  font-weight: 700;
  font-family: monospace;
}
.metric-unit {
  font-size: 0.6em;
  color: #999;
}
</style>
