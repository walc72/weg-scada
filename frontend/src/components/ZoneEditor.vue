<template>
  <div>
    <div v-for="g in gaugeKeys" :key="g.key" class="mb-3">
      <div class="font-weight-bold mb-1">{{ g.label }} <span class="text-caption text-grey">({{ g.unit }})</span></div>
      <div class="grid-4">
        <v-text-field v-model.number="local[g.key].min"    label="Min"           type="number" step="any" variant="outlined" density="compact" hide-details @input="emitChange" />
        <v-text-field v-model.number="local[g.key].max"    label="Max"           type="number" step="any" variant="outlined" density="compact" hide-details @input="emitChange" />
        <v-text-field v-model.number="local[g.key].green"  label="Verde hasta"   type="number" step="any" variant="outlined" density="compact" hide-details @input="emitChange" />
        <v-text-field v-model.number="local[g.key].yellow" label="Amarillo hasta" type="number" step="any" variant="outlined" density="compact" hide-details @input="emitChange" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  zones: { type: Object, required: true },
  type:  { type: String, required: true }
})
const emit = defineEmits(['change'])

const DEFAULTS = {
  CFW900: {
    velocidad:  { min: 0, max: 1800, green: 1200, yellow: 1500 },
    corriente:  { min: 0, max: 150,  green: 80,   yellow: 120 },
    tension:    { min: 0, max: 500,  green: 380,  yellow: 480 },
    frecuencia: { min: 0, max: 70,   green: 50,   yellow: 62 }
  },
  SSW900: {
    corriente: { min: 0, max: 800, green: 500, yellow: 700 },
    tension:   { min: 0, max: 500, green: 380, yellow: 480 }
  }
}

const LABELS = {
  velocidad:  { label: 'Velocidad',      unit: 'RPM' },
  corriente:  { label: 'Corriente',      unit: 'A' },
  tension:    { label: 'Tensión Salida', unit: 'V' },
  frecuencia: { label: 'Frecuencia',     unit: 'Hz' }
}

function buildLocal() {
  const def = DEFAULTS[props.type] || DEFAULTS.CFW900
  const out = {}
  for (const k of Object.keys(def)) {
    out[k] = { ...def[k], ...(props.zones[k] || {}) }
  }
  return out
}

const local = ref(buildLocal())

const gaugeKeys = ref(Object.keys(local.value).map(k => ({ key: k, ...LABELS[k] })))

watch(() => props.zones, () => { local.value = buildLocal() }, { deep: true })

function emitChange() {
  emit('change', JSON.parse(JSON.stringify(local.value)))
}
</script>

<style scoped>
.grid-4 { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); }
@media (max-width: 700px) {
  .grid-4 { grid-template-columns: 1fr 1fr; }
}
</style>
