<template>
  <v-app :theme="theme">
    <v-app-bar :color="theme === 'dark' ? 'grey-darken-4' : 'indigo-darken-3'" density="compact">
      <v-app-bar-nav-icon @click="rail = !rail" />
      <v-app-bar-title>
        <strong>agriplus</strong> · Monitoreo de Drives
      </v-app-bar-title>
      <v-spacer />
      <v-btn icon @click="toggleTheme" :title="theme === 'dark' ? 'Modo claro' : 'Modo oscuro'">
        <v-icon>{{ theme === 'dark' ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>
      <v-chip color="green" variant="tonal" size="small" class="mr-3">v3-spa</v-chip>
    </v-app-bar>
    <v-navigation-drawer :rail="rail" permanent>
      <v-list nav>
        <v-list-item to="/" prepend-icon="mdi-view-dashboard" title="Dashboard" />
        <v-list-item to="/historicos" prepend-icon="mdi-chart-line" title="Históricos" />
        <v-list-item to="/config" prepend-icon="mdi-cog" title="Configuración" />
      </v-list>
    </v-navigation-drawer>
    <v-main>
      <v-container fluid>
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const theme = ref(localStorage.getItem('theme') || 'light')
const rail = ref(false)

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  localStorage.setItem('theme', theme.value)
}

onMounted(() => {
  document.title = 'WEG SCADA · Agriplus'
})
</script>

<style>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
