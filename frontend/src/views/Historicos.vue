<template>
  <v-card class="pa-0" elevation="2" rounded="lg">
    <v-toolbar color="indigo-darken-3" density="compact">
      <v-icon class="ml-3">mdi-chart-line</v-icon>
      <v-toolbar-title class="text-white">Históricos</v-toolbar-title>
      <v-spacer />
      <v-btn-toggle v-model="range" mandatory density="compact" color="white">
        <v-btn value="1h" size="small">1h</v-btn>
        <v-btn value="6h" size="small">6h</v-btn>
        <v-btn value="24h" size="small">24h</v-btn>
        <v-btn value="7d" size="small">7d</v-btn>
        <v-btn value="30d" size="small">30d</v-btn>
      </v-btn-toggle>
      <v-btn icon class="ml-2" @click="reload" title="Recargar">
        <v-icon color="white">mdi-refresh</v-icon>
      </v-btn>
      <v-btn icon class="ml-1" :href="grafanaUrl" target="_blank" title="Abrir en Grafana">
        <v-icon color="white">mdi-open-in-new</v-icon>
      </v-btn>
    </v-toolbar>

    <div v-if="!grafanaReachable" class="text-center pa-8">
      <v-icon size="48" color="grey">mdi-server-off</v-icon>
      <h3 class="mt-3 text-grey">Grafana no disponible</h3>
      <p class="text-grey-darken-1 mt-2">
        En modo desarrollo (mock) Grafana no está corriendo.<br>
        En producción, esta vista embebe el dashboard de Grafana en
        <code>{{ grafanaHost }}</code>.
      </p>
      <v-btn class="mt-4" color="indigo" variant="tonal" @click="checkGrafana">
        <v-icon start>mdi-refresh</v-icon>
        Reintentar
      </v-btn>
    </div>

    <iframe v-else
            :key="iframeKey"
            :src="iframeUrl"
            class="grafana-frame" />
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

// Configurable via env. In dev: localhost:3000. In prod: same host as the SPA.
const GRAFANA_HOST = import.meta.env.VITE_GRAFANA_HOST || `${window.location.protocol}//${window.location.hostname}:3000`
const DASHBOARD_UID = import.meta.env.VITE_GRAFANA_DASHBOARD_UID || '09a1e458-a873-4fe2-a183-13fd204b2c02'

const range = ref('6h')
const iframeKey = ref(0)
const grafanaReachable = ref(false)

const grafanaHost = computed(() => GRAFANA_HOST)

const iframeUrl = computed(() => {
  const from = `now-${range.value}`
  return `${GRAFANA_HOST}/d/${DASHBOARD_UID}?orgId=1&from=${from}&to=now&kiosk=tv&theme=light&refresh=10s`
})

const grafanaUrl = computed(() =>
  `${GRAFANA_HOST}/d/${DASHBOARD_UID}?orgId=1&from=now-${range.value}&to=now`
)

function reload() { iframeKey.value++ }

async function checkGrafana() {
  // In mock mode, assume Grafana not available unless overridden
  if (import.meta.env.VITE_DATA_MODE === 'mock' || !import.meta.env.VITE_DATA_MODE) {
    grafanaReachable.value = false
    return
  }
  try {
    await fetch(`${GRAFANA_HOST}/api/health`, { mode: 'no-cors', cache: 'no-store' })
    grafanaReachable.value = true
  } catch (e) {
    grafanaReachable.value = false
  }
}

onMounted(checkGrafana)
</script>

<style scoped>
.grafana-frame {
  width: 100%;
  height: calc(100vh - 180px);
  min-height: 600px;
  border: 0;
  display: block;
}
</style>
