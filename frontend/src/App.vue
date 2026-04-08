<template>
  <v-app>
    <v-app-bar color="indigo-darken-3" density="compact">
      <v-app-bar-title>
        <strong>agriplus</strong> · Monitoreo de Drives
      </v-app-bar-title>
      <v-spacer />
      <v-chip color="green" variant="tonal" size="small">v3-spa</v-chip>
    </v-app-bar>
    <v-navigation-drawer permanent>
      <v-list nav>
        <v-list-item to="/" prepend-icon="mdi-view-dashboard" title="Dashboard" />
        <v-list-item to="/historicos" prepend-icon="mdi-chart-line" title="Históricos" />
        <v-list-item to="/config" prepend-icon="mdi-cog" title="Configuración" />
      </v-list>
    </v-navigation-drawer>
    <v-main>
      <v-container fluid>
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup></script>
