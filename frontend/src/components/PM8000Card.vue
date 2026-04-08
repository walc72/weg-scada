<template>
  <v-card :style="{ borderLeft: `4px solid ${m.online ? '#16a34a' : '#9ca3af'}` }"
          elevation="2" rounded="lg" class="pa-0">
    <v-card-item class="pb-1">
      <template #title>
        <div class="d-flex align-center" style="gap:8px">
          <v-icon color="indigo">mdi-flash</v-icon>
          <span class="font-weight-bold" style="font-size:1.1em">{{ title }}</span>
          <v-chip size="x-small" variant="tonal" color="indigo">PM8000</v-chip>
        </div>
      </template>
      <template #append>
        <v-chip :color="m.online ? 'green' : 'grey'" variant="elevated" size="default" label
                style="font-weight:800; letter-spacing:0.5px">
          <v-icon start :icon="m.online ? 'mdi-check-circle' : 'mdi-power-plug-off'" />
          {{ m.online ? 'ONLINE' : 'OFFLINE' }}
        </v-chip>
      </template>
    </v-card-item>
    <v-divider />
    <div v-if="m.online" class="gauges-grid">
      <HalfGauge v-for="g in gauges" :key="g.label" v-bind="g" />
    </div>
    <div v-else class="text-center pa-6 text-grey-lighten-1">
      <v-icon size="36" color="grey-lighten-1">mdi-power-plug-off</v-icon>
      <div class="mt-1">Medidor sin conexión</div>
    </div>
  </v-card>
</template>

<script setup>
import { computed } from 'vue'
import HalfGauge from './HalfGauge.vue'

const props = defineProps({ m: { type: Object, required: true } })

const title = computed(() => props.m.uiConfig?.title || 'Medición Línea Exclusiva')

const gauges = computed(() => {
  const m = props.m
  const c = m.uiConfig?.zones || {}
  const v = c.voltage || { min: 0, max: 36, green: 33, yellow: 34.5 }
  const i = c.current || { min: 0, max: 200, green: 120, yellow: 170 }
  const p = c.power   || { min: 0, max: 2000, green: 1500, yellow: 1800 }
  const f = c.pf      || { min: 0, max: 1, green: 0.85, yellow: 0.95 }
  return [
    { value: (m.voltage || 0) / 1000, label: 'Tensión L-L', unit: 'kV', ...v, decimals: 2 },
    { value: m.current || 0,          label: 'Corriente',   unit: 'A',  ...i },
    { value: (m.power || 0) / 1000,   label: 'Potencia',    unit: 'kW', ...p },
    { value: Math.abs(m.pf || 0),     label: 'Factor Pot.', unit: '',   ...f, decimals: 3, invert: true }
  ]
})
</script>

<style scoped>
.gauges-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 12px 16px;
}
</style>
