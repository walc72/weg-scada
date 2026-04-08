<template>
  <!-- LOGIN -->
  <div v-if="!authed" class="login-wrap">
    <div class="login-card">
      <div class="lock-icon">🔒</div>
      <h3>Acceso Restringido</h3>
      <p>Ingrese la contraseña para acceder</p>
      <input
        type="password"
        v-model="pw"
        placeholder="Contraseña"
        @keyup.enter="checkPw"
        class="pw-input"
      />
      <div v-if="pwError" class="pw-error">Contraseña incorrecta</div>
      <button @click="checkPw" class="btn-primary btn-block">Ingresar</button>
    </div>
  </div>

  <!-- AUTHENTICATED -->
  <div v-else class="cfg-root">
    <!-- Tabs -->
    <div class="tabs">
      <button
        @click="activeTab = 'devices'"
        class="tab"
        :class="{ active: activeTab === 'devices' }"
      >Dispositivos</button>
      <button
        @click="activeTab = 'zones'"
        class="tab"
        :class="{ active: activeTab === 'zones' }"
      >Zonas de Gauges</button>
      <button
        @click="activeTab = 'pm8000'; loadPm8000()"
        class="tab"
        :class="{ active: activeTab === 'pm8000' }"
      >PM8000</button>
    </div>

    <!-- Info banner -->
    <div v-if="info" class="info-banner" :class="{ ok: infoOk, err: !infoOk }">
      {{ info }}
    </div>

    <!-- ============== DEVICES ============== -->
    <div v-show="activeTab === 'devices'">
      <div class="section-head">
        <h2>Dispositivos</h2>
        <button class="btn-primary" @click="showAdd = true">+ Agregar Drive</button>
      </div>

      <h3 class="subhead">Gateways</h3>
      <table class="data-table mb-3">
        <thead>
          <tr><th>Nombre</th><th>IP</th><th class="center">Puerto</th><th>Sitio</th></tr>
        </thead>
        <tbody>
          <tr v-for="g in gateways" :key="g.name">
            <td><strong>{{ g.name }}</strong></td>
            <td class="mono">{{ g.ip }}</td>
            <td class="center">{{ g.port }}</td>
            <td>{{ g.site }}</td>
          </tr>
        </tbody>
      </table>

      <h3 class="subhead">Dispositivos ({{ devices.length }})</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Nombre</th><th class="center">Tipo</th><th>Sitio</th>
            <th>IP</th><th class="center">Puerto</th><th class="center">Unit ID</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, i) in devices" :key="d.name + i">
            <template v-if="editIdx === i">
              <td><input v-model="editDev.name" class="input-cell" /></td>
              <td><select v-model="editDev.type" class="input-cell"><option>CFW900</option><option>SSW900</option></select></td>
              <td><select v-model="editDev.site" class="input-cell"><option>Agriplus</option><option>Agrocaraya</option></select></td>
              <td><input v-model="editDev.ip" class="input-cell mono" /></td>
              <td><input v-model.number="editDev.port" type="number" class="input-cell narrow" /></td>
              <td><input v-model.number="editDev.unitId" type="number" class="input-cell narrow" /></td>
              <td class="nowrap">
                <button class="btn-success" @click="saveEdit(i)">Guardar</button>
                <button class="btn-grey" @click="editIdx = -1">Cancelar</button>
              </td>
            </template>
            <template v-else>
              <td><strong>{{ d.name }}</strong></td>
              <td class="center">
                <span class="type-chip" :class="d.type === 'CFW900' ? 'cfw' : 'ssw'">{{ d.type }}</span>
              </td>
              <td>{{ d.site }}</td>
              <td class="mono">{{ d.ip }}</td>
              <td class="center">{{ d.port }}</td>
              <td class="center">{{ d.unitId }}</td>
              <td class="nowrap">
                <button class="btn-primary sm" @click="startEdit(i)">Editar</button>
                <button class="btn-danger sm" @click="delDevice(d.name)">Eliminar</button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <!-- Add device modal -->
      <div v-if="showAdd" class="modal-overlay">
        <div class="modal">
          <h3>Agregar Dispositivo</h3>
          <div class="form-col">
            <div class="field">
              <label>Nombre</label>
              <input v-model="newDev.name" placeholder="SAER X" />
            </div>
            <div class="field">
              <label>Tipo</label>
              <select v-model="newDev.type"><option>CFW900</option><option>SSW900</option></select>
            </div>
            <div class="field">
              <label>Sitio</label>
              <select v-model="newDev.site"><option>Agriplus</option><option>Agrocaraya</option></select>
            </div>
            <div class="field">
              <label>IP</label>
              <input v-model="newDev.ip" placeholder="192.168.10.x" class="mono" />
            </div>
            <div class="d-flex gap-2">
              <div class="field flex-1">
                <label>Puerto</label>
                <input v-model.number="newDev.port" type="number" />
              </div>
              <div class="field flex-1">
                <label>Unit ID</label>
                <input v-model.number="newDev.unitId" type="number" />
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-grey" @click="showAdd = false">Cancelar</button>
            <button class="btn-primary" @click="addDevice">Agregar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============== ZONES ============== -->
    <div v-show="activeTab === 'zones'">
      <div class="section-head">
        <h2>Zonas de Gauges</h2>
        <button class="btn-primary" :disabled="savingZ" @click="saveZones">
          {{ savingZ ? 'Guardando...' : 'Guardar Cambios' }}
        </button>
      </div>
      <p class="muted">Configure los rangos Verde/Amarillo/Rojo para cada gauge.</p>

      <div v-for="site in zSites" :key="site" class="mb-3">
        <div class="site-header" :class="{ open: zSiteOpen[site] }" @click="zSiteOpen[site] = !zSiteOpen[site]">
          <span class="caret" :class="{ open: zSiteOpen[site] }">▶</span>
          <strong>{{ site }}</strong>
          <span class="muted small">({{ zDrivesFor(site).length }} drives)</span>
        </div>
        <div v-show="zSiteOpen[site]" class="site-body">
          <div v-for="zd in zDrivesFor(site)" :key="zd.name" class="drive-block">
            <div class="drive-header" @click="zOpen[zd.name] = !zOpen[zd.name]" :class="{ open: zOpen[zd.name] }">
              <span class="caret small" :class="{ open: zOpen[zd.name] }">▶</span>
              <strong>{{ zd.name }}</strong>
              <span class="type-chip" :class="zd.type === 'CFW900' ? 'cfw' : 'ssw'">{{ zd.type }}</span>
            </div>
            <div v-show="zOpen[zd.name]" class="drive-body">
              <table class="zone-table">
                <thead>
                  <tr>
                    <th>Gauge</th><th>Min</th><th>Max</th>
                    <th class="green">Rojo Bajo</th><th class="green">Verde hasta</th><th class="yellow">Amarillo hasta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="g in zGaugeList(zd)" :key="g.key">
                    <td><strong>{{ g.label }}</strong> <span class="muted small">({{ g.unit }})</span></td>
                    <td><input type="number" v-model.number="zd.zones[g.key].min" class="num" /></td>
                    <td><input type="number" v-model.number="zd.zones[g.key].max" class="num" /></td>
                    <td>
                      <input v-if="g.key === 'tension'" type="number" v-model.number="zd.zones[g.key].redLow" class="num red" />
                      <span v-else class="muted">-</span>
                    </td>
                    <td><input type="number" v-model.number="zd.zones[g.key].green" class="num green" /></td>
                    <td><input type="number" v-model.number="zd.zones[g.key].yellow" class="num yellow" /></td>
                  </tr>
                </tbody>
              </table>
              <button class="btn-outline sm" @click="zResetDrive(zd)">Restaurar defaults</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============== PM8000 ============== -->
    <div v-show="activeTab === 'pm8000'">
      <div class="section-head">
        <h2>Configuración PM8000</h2>
        <button class="btn-primary" @click="savePm8000">Guardar</button>
      </div>
      <div class="pm-card">
        <label class="muted small">Título del medidor</label>
        <input v-model="pm8000.title" type="text" class="input-full" />
      </div>
      <div v-for="(z, k) in pm8000.zones" :key="k" class="pm-card">
        <div class="pm-zone-title">{{ pmLabels[k] }}</div>
        <div class="grid-4">
          <div><label class="muted small">Min</label><input v-model.number="z.min" type="number" step="any" /></div>
          <div><label class="muted small">Max</label><input v-model.number="z.max" type="number" step="any" /></div>
          <div><label class="muted small">Verde hasta</label><input v-model.number="z.green" type="number" step="any" /></div>
          <div><label class="muted small">Amarillo hasta</label><input v-model.number="z.yellow" type="number" step="any" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '../stores/config.js'

const PASSWORD = 'Agriplus00..'
const store = useConfigStore()

// ─── State ───────────────────────────────────────────────
const authed = ref(false)
const pw = ref('')
const pwError = ref(false)
const activeTab = ref('devices')
const info = ref('')
const infoOk = ref(true)

// devices tab
const showAdd = ref(false)
const editIdx = ref(-1)
const editDev = ref({})
const newDev = ref({ name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1 })

// zones tab
const zDrives = ref([])
const zSites = ref([])
const zSiteOpen = ref({})
const zOpen = ref({})
const savingZ = ref(false)

// pm8000 tab
const pm8000 = ref({ title: '', zones: { voltage: {}, current: {}, power: {}, pf: {} } })
const pmLabels = { voltage: 'Tensión (kV)', current: 'Corriente (A)', power: 'Potencia (kW)', pf: 'Factor de Potencia' }
const pmDefaults = {
  title: 'Medición Línea Exclusiva',
  zones: {
    voltage: { min: 0, max: 36, green: 33, yellow: 34.5 },
    current: { min: 0, max: 200, green: 120, yellow: 170 },
    power:   { min: 0, max: 2000, green: 1500, yellow: 1800 },
    pf:      { min: 0, max: 1, green: 0.85, yellow: 0.95 }
  }
}

const zDefaults = {
  CFW900: {
    velocidad:  { min: 0, max: 1800, green: 1200, yellow: 1500 },
    corriente:  { min: 0, max: 150,  green: 80,   yellow: 120 },
    tension:    { min: 0, max: 500, redLow: 350, green: 380, yellow: 480 },
    frecuencia: { min: 0, max: 70,   green: 50,   yellow: 62 }
  },
  SSW900: {
    corriente: { min: 0, max: 800, green: 500, yellow: 700 },
    tension:   { min: 0, max: 500, redLow: 350, green: 380, yellow: 480 }
  }
}

// ─── Computed bridges ────────────────────────────────────
const devices = computed(() => store.devices)
const gateways = computed(() => store.gateways)

// ─── Helpers ─────────────────────────────────────────────
function showInfo(text, ok = true) {
  info.value = text
  infoOk.value = ok
  setTimeout(() => { info.value = '' }, 3000)
}

function checkPw() {
  if (pw.value === PASSWORD) {
    authed.value = true
    pwError.value = false
    loadDevices()
    loadZones()
  } else {
    pwError.value = true
  }
}

// ─── Devices ─────────────────────────────────────────────
async function loadDevices() {
  if (!store.config) await store.load()
}

async function addDevice() {
  if (!newDev.value.name.trim()) { showInfo('Nombre obligatorio', false); return }
  if (store.devices.find(d => d.name === newDev.value.name.trim())) {
    showInfo('Ya existe ese nombre', false); return
  }
  store.config.devices.push({ ...newDev.value, name: newDev.value.name.trim(), enabled: true })
  await store.save({})
  showAdd.value = false
  newDev.value = { name: '', type: 'CFW900', site: 'Agriplus', ip: '', port: 502, unitId: 1 }
  showInfo('Agregado')
  loadZones()
}

function startEdit(i) {
  editIdx.value = i
  editDev.value = JSON.parse(JSON.stringify(store.devices[i]))
}

async function saveEdit(i) {
  store.config.devices[i] = JSON.parse(JSON.stringify(editDev.value))
  await store.save({})
  editIdx.value = -1
  showInfo('Actualizado')
}

async function delDevice(name) {
  if (!confirm(`¿Eliminar ${name}?`)) return
  const idx = store.config.devices.findIndex(d => d.name === name)
  if (idx >= 0) {
    store.config.devices.splice(idx, 1)
    await store.save({})
    showInfo(`${name} eliminado`)
    loadZones()
  }
}

// ─── Zones ───────────────────────────────────────────────
function zGetDef(type) {
  const def = zDefaults[type] || zDefaults.CFW900
  const c = {}
  for (const k of Object.keys(def)) c[k] = JSON.parse(JSON.stringify(def[k]))
  return c
}

async function loadZones() {
  if (!store.config) await store.load()
  const cfg = store.config
  if (!cfg) return
  const zones = cfg.gaugeZones || {}
  const siteSet = {}
  zDrives.value = (cfg.devices || []).map(dev => {
    const dz = zGetDef(dev.type)
    const saved = zones[dev.name] || {}
    for (const k of Object.keys(saved)) {
      if (dz[k]) Object.assign(dz[k], saved[k])
    }
    siteSet[dev.site || 'Sin Sitio'] = true
    return { name: dev.name, type: dev.type, site: dev.site || 'Sin Sitio', zones: dz }
  })
  zSites.value = Object.keys(siteSet)
  zSites.value.forEach(s => { zSiteOpen.value[s] = true })
}

function zDrivesFor(site) {
  return zDrives.value.filter(d => d.site === site)
}

function zGaugeList(d) {
  const l = []
  if (d.type === 'CFW900') l.push({ key: 'velocidad', label: 'Velocidad', unit: 'RPM' })
  l.push({ key: 'corriente', label: 'Corriente', unit: 'A' })
  l.push({ key: 'tension',   label: 'Tensión',   unit: 'V' })
  if (d.type === 'CFW900') l.push({ key: 'frecuencia', label: 'Frecuencia', unit: 'Hz' })
  return l
}

function zResetDrive(d) { d.zones = zGetDef(d.type) }

async function saveZones() {
  savingZ.value = true
  const z = {}
  zDrives.value.forEach(d => { z[d.name] = d.zones })
  if (!store.config.gaugeZones) store.config.gaugeZones = {}
  Object.assign(store.config.gaugeZones, z)
  await store.save({})
  savingZ.value = false
  showInfo('Zonas guardadas')
}

// ─── PM8000 ──────────────────────────────────────────────
async function loadPm8000() {
  if (!store.config) await store.load()
  const ui = store.meters[0]?.ui || {}
  const d = JSON.parse(JSON.stringify(pmDefaults))
  d.title = ui.title || d.title
  if (ui.zones) {
    for (const k in d.zones) {
      if (ui.zones[k]) Object.assign(d.zones[k], ui.zones[k])
    }
  }
  pm8000.value = d
}

async function savePm8000() {
  if (!store.meters.length) { showInfo('No hay medidor en config', false); return }
  store.config.meters[0].ui = { title: pm8000.value.title, zones: pm8000.value.zones }
  await store.save({})
  showInfo('PM8000 guardado')
}

onMounted(() => {
  // Pre-load config so it's instant after auth
  if (!store.config) store.load()
})
</script>

<style scoped>
/* ─── Login ─── */
.login-wrap { display: flex; justify-content: center; padding: 60px 16px; }
.login-card {
  max-width: 350px; background: white; border: 1px solid #e0e0e0;
  border-radius: 12px; padding: 32px; text-align: center; font-family: Arial, sans-serif;
}
.lock-icon { font-size: 40px; margin-bottom: 12px; }
.login-card h3 { color: #1a4d8f; margin: 0 0 8px; }
.login-card p { color: #666; font-size: 13px; margin: 0 0 16px; }
.pw-input {
  width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px;
  font-size: 16px; text-align: center; box-sizing: border-box; margin-bottom: 12px;
}
.pw-error { color: #c62828; font-size: 13px; margin-bottom: 12px; }

/* ─── Layout ─── */
.cfg-root { width: 100%; padding: 16px; font-family: Arial, sans-serif; }
.tabs { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid #e0e0e0; }
.tab {
  padding: 12px 24px; border: none; cursor: pointer;
  font-size: 15px; font-weight: bold; background: transparent;
  border-bottom: 3px solid transparent; margin-bottom: -2px;
  color: #999; transition: all 0.2s;
}
.tab.active { color: #1a4d8f; border-bottom-color: #1a4d8f; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.section-head h2 { color: #1a4d8f; margin: 0; }
.subhead { color: #333; margin: 0 0 8px; }

/* ─── Buttons ─── */
.btn-primary {
  background: #1a4d8f; color: white; border: none;
  padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;
}
.btn-primary.sm { padding: 5px 12px; font-size: 13px; margin-right: 4px; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-block { width: 100%; padding: 12px; font-size: 16px; }
.btn-success { background: #2e7d32; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; margin-right: 4px; font-weight: bold; }
.btn-grey    { background: #999;    color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; }
.btn-danger  { background: #c62828; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.btn-danger.sm { padding: 5px 12px; font-size: 13px; }
.btn-outline { background: none; border: 1px solid #999; color: #666; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-top: 6px; }

/* ─── Tables ─── */
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { background: #1a4d8f; color: white; padding: 10px; text-align: left; font-size: 13px; }
.data-table th.center { text-align: center; }
.data-table td { padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 13px; }
.data-table td.center { text-align: center; }
.data-table td.mono { font-family: monospace; }
.data-table td.nowrap { white-space: nowrap; }
.input-cell { width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
.input-cell.narrow { width: 70px; text-align: center; }
.mb-3 { margin-bottom: 24px; }

/* ─── Type chip ─── */
.type-chip { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
.type-chip.cfw { background: #e3f2fd; color: #1565c0; }
.type-chip.ssw { background: #f3e5f5; color: #7b1fa2; }

/* ─── Modal ─── */
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 999;
}
.modal { background: white; padding: 24px; border-radius: 12px; width: 420px; max-width: 90%; }
.modal h3 { color: #1a4d8f; margin: 0 0 16px; }
.form-col { display: flex; flex-direction: column; gap: 10px; }
.field label { font-size: 12px; color: #666; font-weight: bold; display: block; margin-bottom: 2px; }
.field input, .field select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end; }
.d-flex { display: flex; }
.gap-2 { gap: 10px; }
.flex-1 { flex: 1; }

/* ─── Zones tab ─── */
.muted { color: #666; }
.muted.small { font-size: 11px; }
.site-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: #1a4d8f; color: white;
  border-radius: 8px; cursor: pointer; user-select: none;
}
.site-header.open { border-radius: 8px 8px 0 0; }
.caret { font-size: 12px; transition: transform 0.2s; }
.caret.open { transform: rotate(90deg); }
.caret.small { color: #999; }
.site-body { border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; padding: 8px; }
.drive-block { background: white; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 6px; overflow: hidden; }
.drive-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; cursor: pointer; user-select: none; background: white;
}
.drive-header.open { background: #f8f9fa; }
.drive-header strong { color: #1a4d8f; }
.drive-body { padding: 0 14px 12px; }
.zone-table { width: 100%; border-collapse: collapse; }
.zone-table th { background: #f5f5f5; padding: 6px; text-align: center; font-size: 11px; }
.zone-table th:first-child { text-align: left; }
.zone-table th.green { color: #22c55e; }
.zone-table th.yellow { color: #f59e0b; }
.zone-table td { padding: 4px; text-align: center; border-bottom: 1px solid #eee; }
.zone-table td:first-child { text-align: left; padding: 6px; font-size: 13px; }
.num { width: 60px; padding: 5px; border: 1px solid #ccc; border-radius: 4px; text-align: center; font-size: 13px; box-sizing: border-box; }
.num.green  { border-color: #22c55e; background: #f0fdf4; }
.num.yellow { border-color: #f59e0b; background: #fffbeb; }
.num.red    { border-color: #ef4444; background: #fef2f2; }

/* ─── PM8000 tab ─── */
.pm-card { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; }
.pm-card .input-full { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.pm-zone-title { font-weight: bold; color: #1a4d8f; margin-bottom: 8px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.grid-4 input { width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }

/* ─── Info banner ─── */
.info-banner { padding: 10px; border-radius: 6px; margin-bottom: 12px; font-weight: bold; }
.info-banner.ok  { background: #e8f5e9; color: #2e7d32; }
.info-banner.err { background: #fbe9e7; color: #c62828; }

@media (max-width: 700px) {
  .grid-4 { grid-template-columns: 1fr 1fr; }
}
</style>
