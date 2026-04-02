/**
 * fix_alarm_setpoints_page.js
 * Adds an "Alarmas" page to the dashboard with per-drive setpoint editing.
 * Also patches the Config Handler to include alarmSetpoints when saving config.json.
 *
 * Apply:
 *   MSYS_NO_PATHCONV=1 docker cp nodered/fix_alarm_setpoints_page.js projects-nodered-1:/data/fix_alarm_setpoints_page.js
 *   MSYS_NO_PATHCONV=1 docker exec projects-nodered-1 node /data/fix_alarm_setpoints_page.js
 *   docker restart projects-nodered-1
 */

const fs = require('fs');
const FLOWS_PATH = '/data/flows.json';
const flows = JSON.parse(fs.readFileSync(FLOWS_PATH, 'utf8'));

// ─── Guard: don't apply twice ───────────────────────────────────────
if (flows.find(n => n.id === 'weg_d2_pg_alarms')) {
  console.log('⚠️  Alarm setpoints page already exists. Skipping.');
  process.exit(0);
}

const TAB = 'weg_d2_tab';

// ─── 1. New page ────────────────────────────────────────────────────
flows.push({
  id: 'weg_d2_pg_alarms',
  type: 'ui-page',
  name: 'Alarmas',
  ui: 'weg_d2_base',
  path: '/alarms',
  icon: 'mdi-bell-alert',
  layout: 'notebook',
  theme: 'weg_d2_theme',
  order: 6,
  className: '',
  visible: 'true',
  disabled: 'false'
});

// ─── 2. Group for setpoints ─────────────────────────────────────────
flows.push({
  id: 'weg_d2_g_alarms',
  type: 'ui-group',
  name: 'Setpoints de Alarma',
  page: 'weg_d2_pg_alarms',
  width: '24',
  height: '1',
  order: 1,
  showTitle: true,
  className: '',
  visible: 'true',
  disabled: 'false'
});

// ─── 3. UI Template - Setpoint Editor ───────────────────────────────
flows.push({
  id: 'weg_alarm_sp_ui',
  type: 'ui-template',
  z: TAB,
  group: 'weg_d2_g_alarms',
  name: 'Setpoint Editor',
  order: 1,
  width: '24',
  height: '20',
  head: '',
  format: `<template>
  <div style="font-family:Arial,sans-serif;padding:16px;max-width:1200px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <h2 style="margin:0;color:#1a4d8f">⚙️ Setpoints de Alarma por Drive</h2>
        <p style="margin:4px 0 0;color:#666;font-size:13px">Los cambios se aplican automáticamente al guardar (hot-reload)</p>
      </div>
      <button @click="saveAll" :disabled="saving"
        style="background:#1a4d8f;color:white;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:bold">
        {{ saving ? 'Guardando...' : '💾 Guardar Setpoints' }}
      </button>
    </div>

    <div v-if="message" :style="{padding:'10px 16px',borderRadius:'6px',marginBottom:'12px',background:messageType==='ok'?'#e8f5e9':'#fbe9e7',color:messageType==='ok'?'#2e7d32':'#c62828',fontWeight:'bold'}">
      {{ message }}
    </div>

    <div v-for="(drive, idx) in drives" :key="drive.name"
      style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:18px">{{ drive.type === 'CFW900' ? '🔄' : '⚡' }}</span>
        <strong style="font-size:16px;color:#1a4d8f">{{ drive.name }}</strong>
        <span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:12px;font-size:12px">{{ drive.type }}</span>
        <span style="background:#f3e5f5;color:#7b1fa2;padding:2px 8px;border-radius:12px;font-size:12px">{{ drive.site }}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        <div v-for="sp in spFields" :key="sp.key" style="display:flex;flex-direction:column">
          <label style="font-size:12px;color:#666;margin-bottom:4px">{{ sp.label }}</label>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" :step="sp.step" :min="0"
              v-model.number="drive.setpoints[sp.key]"
              style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:14px"
              @focus="$event.target.select()" />
            <span style="font-size:12px;color:#999;white-space:nowrap">{{ sp.unit }}</span>
          </div>
        </div>
      </div>

      <div style="margin-top:8px;display:flex;gap:8px">
        <button @click="copyToType(drive)" style="background:none;border:1px solid #1a4d8f;color:#1a4d8f;padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer">
          📋 Copiar a todos los {{ drive.type }}
        </button>
        <button @click="resetToDefaults(drive)" style="background:none;border:1px solid #999;color:#666;padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer">
          ↩️ Restaurar defaults
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      drives: [],
      defaults: {},
      saving: false,
      message: '',
      messageType: 'ok',
      spFields: [
        { key: 'currentHigh', label: 'Corriente Alta', unit: 'A', step: 1 },
        { key: 'tempHigh', label: 'Temperatura Alta', unit: '°C', step: 1 },
        { key: 'voltageHigh', label: 'Voltaje Alto', unit: 'V', step: 10 },
        { key: 'voltageLow', label: 'Voltaje Bajo', unit: 'V', step: 10 },
        { key: 'frequencyHigh', label: 'Frecuencia Alta', unit: 'Hz', step: 1 },
        { key: 'commErrorMax', label: 'Errores Comm Max', unit: '', step: 1 }
      ]
    }
  },
  watch: {
    msg(val) {
      if (val && val.payload && val.topic === 'spLoad') {
        this.loadData(val.payload);
      }
      if (val && val.topic === 'spSaved') {
        this.saving = false;
        this.message = '✅ Setpoints guardados correctamente';
        this.messageType = 'ok';
        setTimeout(() => this.message = '', 3000);
      }
      if (val && val.topic === 'spError') {
        this.saving = false;
        this.message = '❌ Error: ' + (val.payload || 'desconocido');
        this.messageType = 'error';
      }
    }
  },
  mounted() {
    this.send({ topic: 'spInit' });
  },
  methods: {
    loadData(data) {
      this.defaults = data.defaults || {};
      const devices = data.devices || [];
      const overrides = data.overrides || {};
      this.drives = devices.map(d => {
        const typeDefaults = this.defaults[d.type] || {};
        const devOverrides = overrides[d.name] || {};
        return {
          name: d.name,
          type: d.type,
          site: d.site,
          setpoints: { ...typeDefaults, ...devOverrides }
        };
      });
    },
    saveAll() {
      this.saving = true;
      const overrides = {};
      this.drives.forEach(d => {
        const typeDefaults = this.defaults[d.type] || {};
        const diff = {};
        let hasDiff = false;
        Object.keys(d.setpoints).forEach(k => {
          if (d.setpoints[k] !== typeDefaults[k]) {
            diff[k] = d.setpoints[k];
            hasDiff = true;
          }
        });
        if (hasDiff) overrides[d.name] = diff;
      });
      this.send({ topic: 'spSave', payload: { defaults: this.defaults, overrides } });
    },
    copyToType(sourceDrive) {
      this.drives.forEach(d => {
        if (d.type === sourceDrive.type && d.name !== sourceDrive.name) {
          d.setpoints = { ...sourceDrive.setpoints };
        }
      });
      this.message = 'Copiado a todos los ' + sourceDrive.type;
      this.messageType = 'ok';
      setTimeout(() => this.message = '', 2000);
    },
    resetToDefaults(drive) {
      const typeDefaults = this.defaults[drive.type] || {};
      drive.setpoints = { ...typeDefaults };
    }
  }
}
<\/script>`,
  storeOutMessages: true,
  passthru: false,
  resendOnRefresh: false,
  templateScope: 'widget:ui',
  className: '',
  x: 450,
  y: 750,
  wires: [['weg_alarm_sp_handler']]
});

// ─── 4. Setpoint Handler Function ───────────────────────────────────
flows.push({
  id: 'weg_alarm_sp_handler',
  type: 'function',
  z: TAB,
  name: 'Setpoint Handler',
  func: `const CONFIG_PATH = '/data/poller-config.json';
const fs = global.get('fs') || this.context().global.get('fs');

function readConfig() {
    try {
        const raw = require('fs').readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(raw);
    } catch(e) {
        node.warn('Cannot read config: ' + e.message);
        return null;
    }
}

function writeConfig(cfg) {
    try {
        require('fs').writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        return true;
    } catch(e) {
        node.warn('Cannot write config: ' + e.message);
        return false;
    }
}

if (msg.topic === 'spInit') {
    const cfg = readConfig();
    if (!cfg) {
        return { topic: 'spError', payload: 'No se pudo leer config.json' };
    }
    const sp = cfg.alarmSetpoints || { defaults: {}, overrides: {} };
    // Ensure defaults exist
    if (!sp.defaults.CFW900) sp.defaults.CFW900 = { currentHigh:130, tempHigh:90, voltageHigh:750, voltageLow:350, frequencyHigh:65, commErrorMax:20 };
    if (!sp.defaults.SSW900) sp.defaults.SSW900 = { currentHigh:130, tempHigh:90, voltageHigh:480, voltageLow:400, frequencyHigh:0, commErrorMax:20 };

    msg.topic = 'spLoad';
    msg.payload = {
        defaults: sp.defaults,
        overrides: sp.overrides || {},
        devices: (cfg.devices || []).map(d => ({ name: d.name, type: d.type, site: d.site }))
    };
    node.status({fill:'blue',shape:'dot',text:'Loaded ' + (cfg.devices||[]).length + ' drives'});
    return msg;
}

if (msg.topic === 'spSave') {
    const cfg = readConfig();
    if (!cfg) {
        return { topic: 'spError', payload: 'No se pudo leer config.json' };
    }

    cfg.alarmSetpoints = {
        defaults: msg.payload.defaults,
        overrides: msg.payload.overrides
    };

    if (writeConfig(cfg)) {
        const overrideCount = Object.keys(msg.payload.overrides).length;
        node.status({fill:'green',shape:'dot',text:'Saved ' + overrideCount + ' overrides'});
        return { topic: 'spSaved', payload: 'ok' };
    } else {
        return { topic: 'spError', payload: 'Error escribiendo config.json' };
    }
}

return null;`,
  outputs: 1,
  timeout: '',
  noerr: 0,
  x: 700,
  y: 750,
  wires: [['weg_alarm_sp_ui']]
});

// ─── 5. Comment separator ───────────────────────────────────────────
flows.push({
  id: 'weg_comment_sp_page',
  type: 'comment',
  z: TAB,
  name: '─── ALARM SETPOINTS PAGE ───',
  info: 'Dashboard page for editing per-drive alarm setpoints.\nReads/writes alarmSetpoints in config.json.',
  x: 450,
  y: 720,
  wires: []
});

// ─── 6. Patch Config Handler to include alarmSetpoints ──────────────
const cfgHandler = flows.find(n => n.id === 'weg_d2_config_handler');
if (cfgHandler) {
  // Add alarmSetpoints preservation when Config Handler writes config.json
  cfgHandler.func = cfgHandler.func.replace(
    'var configJson = {',
    `// Preserve alarm setpoints from existing config
    var existingConfig = {};
    try { existingConfig = JSON.parse(require('fs').readFileSync('/data/poller-config.json','utf8')); } catch(e) {}
    var alarmSetpoints = existingConfig.alarmSetpoints || {defaults:{},overrides:{}};

    var configJson = {`
  );
  cfgHandler.func = cfgHandler.func.replace(
    'devices: driveList.map',
    'alarmSetpoints: alarmSetpoints,\n        devices: driveList.map'
  );
  console.log('✅ Config Handler patched to preserve alarmSetpoints');
}

// ─── Save ───────────────────────────────────────────────────────────
fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows, null, 2));
console.log('✅ Alarm setpoints page added:');
console.log('   - Page: "Alarmas" (order 6, icon: bell-alert)');
console.log('   - Per-drive setpoint editor with grid layout');
console.log('   - "Copy to all [type]" button per drive');
console.log('   - "Reset to defaults" button per drive');
console.log('   - Auto-saves to config.json (hot-reload by poller)');
console.log('   - Config Handler patched to preserve setpoints on device saves');
