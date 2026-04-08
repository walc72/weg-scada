<template>
  <v-card :style="{ borderLeft: `6px solid ${stats.color}` }" elevation="2" rounded="lg" class="pa-3">
    <div class="d-flex align-center">
      <v-icon :color="stats.color" size="32" class="mr-3">{{ stats.icon }}</v-icon>
      <div class="flex-grow-1">
        <div class="text-h6 font-weight-bold" :style="{ color: stats.color }">
          {{ stats.text }}
        </div>
        <div class="text-caption text-grey">
          Total: {{ stats.total }} · Online: {{ stats.online }} · Marcha: {{ stats.running }} · Fallas: {{ stats.faults }} · Offline: {{ stats.offline }}
        </div>
      </div>
      <v-chip :color="connected ? 'green' : 'grey'" variant="tonal" size="small">
        <v-icon start :icon="connected ? 'mdi-lan-connect' : 'mdi-lan-disconnect'" />
        {{ connected ? 'CONECTADO' : 'SIN CONEXIÓN' }}
      </v-chip>
    </div>
  </v-card>
</template>

<script setup>
defineProps({
  stats: { type: Object, required: true },
  connected: { type: Boolean, default: false }
})
</script>
