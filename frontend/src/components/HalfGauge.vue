<template>
  <div class="text-center">
    <div class="gauge-label">{{ label }}</div>
    <svg viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet" class="gauge-svg">
      <!-- Background zones -->
      <circle cx="50" cy="50" r="36" fill="none" :stroke="c1" stroke-width="7" opacity="0.3"
              :stroke-dasharray="`${gLen} 226`" stroke-dashoffset="0"
              transform="rotate(180,50,50)" stroke-linecap="butt" />
      <circle cx="50" cy="50" r="36" fill="none" :stroke="c2" stroke-width="7" opacity="0.3"
              :stroke-dasharray="`${yLen} 226`" :stroke-dashoffset="`-${gLen}`"
              transform="rotate(180,50,50)" stroke-linecap="butt" />
      <circle cx="50" cy="50" r="36" fill="none" :stroke="c3" stroke-width="7" opacity="0.3"
              :stroke-dasharray="`${rLen} 226`" :stroke-dashoffset="`-${gLen + yLen}`"
              transform="rotate(180,50,50)" stroke-linecap="butt" />
      <!-- Value arc -->
      <circle v-if="fillLen > 0.5" cx="50" cy="50" r="36" fill="none" :stroke="arcColor"
              stroke-width="7" :stroke-dasharray="`${fillLen} 226`" stroke-dashoffset="0"
              transform="rotate(180,50,50)" stroke-linecap="round" />
      <!-- Text -->
      <text x="50" y="38" text-anchor="middle" fill="#1a1a2e" font-size="17"
            font-weight="700" font-family="monospace">{{ display }}</text>
      <text x="50" y="51" text-anchor="middle" fill="#999" font-size="10"
            font-family="monospace">{{ unit }}</text>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  label: { type: String, required: true },
  unit:  { type: String, default: '' },
  min:   { type: Number, default: 0 },
  max:   { type: Number, default: 100 },
  green: { type: Number, default: 60 },
  yellow:{ type: Number, default: 85 },
  c1: { type: String, default: '#22c55e' },
  c2: { type: String, default: '#f59e0b' },
  c3: { type: String, default: '#ef4444' },
  decimals: { type: Number, default: null }
})

const HALF = 113.097

const range = computed(() => Math.max(props.max - props.min, 1))
const gPct  = computed(() => (props.green - props.min) / range.value)
const yPct  = computed(() => (props.yellow - props.min) / range.value)
const vPct  = computed(() => Math.max(0, Math.min((props.value - props.min) / range.value, 1)))

const gLen = computed(() => gPct.value * HALF)
const yLen = computed(() => (yPct.value - gPct.value) * HALF)
const rLen = computed(() => (1 - yPct.value) * HALF)
const fillLen = computed(() => vPct.value * HALF)

const arcColor = computed(() => {
  if (props.value <= props.green) return props.c1
  if (props.value <= props.yellow) return props.c2
  return props.c3
})

const display = computed(() => {
  const v = props.value
  if (v == null || isNaN(v)) return '0'
  if (props.decimals != null) return v.toFixed(props.decimals)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (v % 1 !== 0) return v.toFixed(1)
  return v.toString()
})
</script>

<style scoped>
.gauge-label {
  font-size: 0.7em;
  color: #888;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}
.gauge-svg {
  width: 100%;
  max-width: 180px;
  height: auto;
  display: block;
  margin: 0 auto;
}
</style>
