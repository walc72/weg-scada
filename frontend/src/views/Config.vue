<template>
  <!-- Auth gate -->
  <v-card v-if="!authed" class="mx-auto pa-6" max-width="400" elevation="2" rounded="lg">
    <div class="text-center mb-4">
      <v-icon size="48" color="indigo">mdi-lock</v-icon>
      <h2 class="mt-2 text-indigo-darken-3">Acceso Restringido</h2>
      <p class="text-grey">Ingrese la contraseña para acceder</p>
    </div>
    <v-text-field
      v-model="pw"
      type="password"
      label="Contraseña"
      variant="outlined"
      density="compact"
      hide-details
      autofocus
      :error="pwError"
      @keyup.enter="checkPw"
    />
    <div v-if="pwError" class="text-error text-caption mt-1">Contraseña incorrecta</div>
    <v-btn color="indigo" variant="elevated" block class="mt-4" @click="checkPw">Ingresar</v-btn>
  </v-card>

  <!-- Loading -->
  <v-card v-else-if="store.loading || !store.config" class="pa-8 text-center" elevation="2" rounded="lg">
    <v-progress-circular indeterminate color="indigo" />
    <div class="mt-3 text-grey">Cargando configuración...</div>
  </v-card>

  <!-- Authenticated content -->
  <v-card v-else class="pa-0" elevation="2" rounded="lg">
    <v-tabs v-model="tab" color="indigo-darken-3" align-tabs="start" grow>
      <v-tab value="devices"><v-icon start>mdi-chip</v-icon>Dispositivos</v-tab>
      <v-tab value="zones"><v-icon start>mdi-gauge</v-icon>Zonas de Gauges</v-tab>
      <v-tab value="pm8000"><v-icon start>mdi-flash</v-icon>PM8000</v-tab>
    </v-tabs>

    <v-divider />

    <v-window v-model="tab">
      <!-- DEVICES -->
      <v-window-item value="devices" class="pa-4">
        <div class="d-flex align-center mb-3">
          <h3 class="text-indigo-darken-3">Dispositivos</h3>
          <v-spacer />
          <v-btn color="indigo" prepend-icon="mdi-plus" @click="addDeviceDialog = true">Agregar</v-btn>
        </div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Habilitado</th><th>Nombre</th><th>Tipo</th><th>Sitio</th>
              <th>IP</th><th>Puerto</th><th>Slave</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in store.devices" :key="d.name">
              <td><v-switch v-model="d.enabled" hide-details density="compact" color="indigo" @change="markDirty" /></td>
              <td><strong>{{ d.name }}</strong></td>
              <td><v-chip size="x-small" :color="d.type === 'SSW900' ? 'purple' : 'blue'" variant="tonal">{{ d.type }}</v-chip></td>
              <td>{{ d.site }}</td>
              <td><code>{{ d.ip }}</code></td>
              <td>{{ d.port }}</td>
              <td>{{ d.unitId }}</td>
              <td><v-btn icon size="small" variant="text" color="error" @click="removeDevice(i)"><v-icon>mdi-delete</v-icon></v-btn></td>
            </tr>
          </tbody>
        </v-table>
      </v-window-item>

      <!-- ZONES -->
      <v-window-item value="zones" class="pa-4">
        <h3 class="text-indigo-darken-3 mb-3">Zonas de Gauges por Drive</h3>
        <p class="text-caption text-grey mb-3">
          Configurá los rangos de cada gauge (min/max/verde/amarillo) por drive.
          Los valores fuera de zona se muestran en rojo en el dashboard.
        </p>
        <v-expansion-panels variant="accordion">
          <v-expansion-panel v-for="d in store.devices" :key="d.name">
            <v-expansion-panel-title>
              <v-icon class="mr-2" :color="d.type === 'SSW900' ? 'purple' : 'blue'">mdi-chip</v-icon>
              <strong>{{ d.name }}</strong>
              <v-chip size="x-small" class="ml-2" variant="tonal">{{ d.type }}</v-chip>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <ZoneEditor :zones="getZones(d)" :type="d.type" @change="setZones(d, $event)" />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-window-item>

      <!-- PM8000 -->
      <v-window-item value="pm8000" class="pa-4">
        <h3 class="text-indigo-darken-3 mb-3">Configuración PM8000</h3>
        <div v-if="meter">
          <v-text-field
            v-model="meter.ui.title"
            label="Título del medidor"
            variant="outlined"
            density="compact"
            class="mb-4"
            @input="markDirty"
          />
          <v-card v-for="(z, k) in meter.ui.zones" :key="k" variant="outlined" class="mb-3 pa-3">
            <div class="font-weight-bold text-indigo-darken-3 mb-2">{{ pmLabels[k] }}</div>
            <div class="d-grid grid-4">
              <v-text-field v-model.number="z.min"    label="Min"           type="number" step="any" variant="outlined" density="compact" hide-details @input="markDirty" />
              <v-text-field v-model.number="z.max"    label="Max"           type="number" step="any" variant="outlined" density="compact" hide-details @input="markDirty" />
              <v-text-field v-model.number="z.green"  label="Verde hasta"   type="number" step="any" variant="outlined" density="compact" hide-details @input="markDirty" />
              <v-text-field v-model.number="z.yellow" label="Amarillo hasta" type="number" step="any" variant="outlined" density="compact" hide-details @input="markDirty" />
            </div>
          </v-card>
        </div>
        <div v-else class="text-grey">No hay medidor configurado.</div>
      </v-window-item>
    </v-window>

    <v-divider />

    <!-- Footer with save button -->
    <div class="d-flex align-center pa-3">
      <v-chip v-if="dirty" color="orange" variant="tonal" size="small">
        <v-icon start>mdi-content-save-alert</v-icon>Cambios sin guardar
      </v-chip>
      <v-chip v-else-if="store.lastSaved" color="green" variant="tonal" size="small">
        <v-icon start>mdi-check</v-icon>Guardado
      </v-chip>
      <v-spacer />
      <v-btn variant="text" @click="reload">Recargar</v-btn>
      <v-btn color="indigo" variant="elevated" :loading="store.loading" @click="saveAll">
        <v-icon start>mdi-content-save</v-icon>Guardar
      </v-btn>
    </div>

    <v-snackbar v-model="showSnack" :color="snackOk ? 'success' : 'error'" :timeout="3000">
      {{ snackText }}
    </v-snackbar>

    <!-- Add device dialog -->
    <v-dialog v-model="addDeviceDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="text-indigo-darken-3">
          <v-icon start>mdi-plus-circle</v-icon>Agregar Dispositivo
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="newDev.name" label="Nombre" variant="outlined" density="compact" :error="!!newDevError" autofocus />
          <v-select v-model="newDev.type" :items="['CFW900','SSW900']" label="Tipo" variant="outlined" density="compact" />
          <v-select v-model="newDev.site" :items="siteOptions" label="Sitio" variant="outlined" density="compact" />
          <v-text-field v-model="newDev.ip" label="IP" variant="outlined" density="compact" placeholder="172.18.0.3" />
          <div class="d-flex" style="gap:8px">
            <v-text-field v-model.number="newDev.port" label="Puerto" type="number" variant="outlined" density="compact" />
            <v-text-field v-model.number="newDev.unitId" label="Slave ID" type="number" variant="outlined" density="compact" />
          </div>
          <div v-if="newDevError" class="text-error text-caption">{{ newDevError }}</div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="addDeviceDialog = false">Cancelar</v-btn>
          <v-btn color="indigo" variant="elevated" @click="addDevice">Agregar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '../stores/config.js'
import ZoneEditor from '../components/ZoneEditor.vue'

const PASSWORD = 'Agriplus00..'

const store = useConfigStore()
const tab = ref('devices')
const authed = ref(false)
const pw = ref('')
const pwError = ref(false)
const dirty = ref(false)
const showSnack = ref(false)
const snackText = ref('')
const snackOk = ref(true)
const addDeviceDialog = ref(false)
const newDev = ref({ name: '', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 502, unitId: 1 })
const newDevError = ref('')

const siteOptions = computed(() => {
  const set = new Set(store.devices.map(d => d.site).filter(Boolean))
  return Array.from(set).length ? Array.from(set) : ['Agriplus', 'Agrocaraya']
})

function addDevice() {
  newDevError.value = ''
  const d = newDev.value
  if (!d.name.trim()) { newDevError.value = 'El nombre es obligatorio'; return }
  if (store.devices.find(x => x.name === d.name.trim())) { newDevError.value = 'Ya existe un dispositivo con ese nombre'; return }
  if (!d.ip.trim()) { newDevError.value = 'La IP es obligatoria'; return }
  store.config.devices.push({ ...d, name: d.name.trim(), ip: d.ip.trim(), enabled: true })
  newDev.value = { name: '', type: 'CFW900', site: 'Agriplus', ip: '172.18.0.3', port: 502, unitId: 1 }
  addDeviceDialog.value = false
  markDirty()
}

const pmLabels = { voltage: 'Tensión (kV)', current: 'Corriente (A)', power: 'Potencia (kW)', pf: 'Factor de Potencia' }

const meter = computed(() => store.meters[0])

function checkPw() {
  if (pw.value === PASSWORD) {
    authed.value = true
    pwError.value = false
    if (!store.config) store.load()
  } else {
    pwError.value = true
  }
}

function markDirty() { dirty.value = true }

function getZones(device) {
  return (store.config.gaugeZones && store.config.gaugeZones[device.name]) || {}
}
function setZones(device, zones) {
  if (!store.config.gaugeZones) store.config.gaugeZones = {}
  store.config.gaugeZones[device.name] = zones
  markDirty()
}

function removeDevice(i) {
  if (!confirm(`¿Eliminar ${store.devices[i].name}?`)) return
  store.config.devices.splice(i, 1)
  markDirty()
}

async function saveAll() {
  const ok = await store.save({})
  snackOk.value = ok
  snackText.value = ok ? 'Configuración guardada' : `Error: ${store.error}`
  showSnack.value = true
  if (ok) dirty.value = false
}

async function reload() {
  await store.load()
  dirty.value = false
}

onMounted(() => {
  if (!store.config) store.load()
})
</script>

<style scoped>
.d-grid { display: grid; gap: 8px; }
.grid-4 { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 700px) {
  .grid-4 { grid-template-columns: 1fr 1fr; }
}
</style>
