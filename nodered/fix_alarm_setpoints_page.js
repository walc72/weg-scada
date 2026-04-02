/**
 * fix_alarm_setpoints_page.js
 * Replaces the alarm setpoints page with a working version.
 * Uses an inject trigger + function node for initial load (avoids D2 mounted race).
 * Function node uses "libs" to import fs module.
 */

const fs = require('fs');
const FLOWS_PATH = '/data/flows.json';
const flows = JSON.parse(fs.readFileSync(FLOWS_PATH, 'utf8'));

const TAB = 'weg_d2_tab';

// ─── Remove old nodes if they exist ─────────────────────────────────
const removeIds = new Set([
  'weg_d2_pg_alarms', 'weg_d2_g_alarms', 'weg_alarm_sp_ui',
  'weg_alarm_sp_handler', 'weg_comment_sp_page', 'weg_alarm_sp_init'
]);
const filtered = flows.filter(n => !removeIds.has(n.id));

// ─── 1. Page ────────────────────────────────────────────────────────
filtered.push({
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

// ─── 2. Group ───────────────────────────────────────────────────────
filtered.push({
  id: 'weg_d2_g_alarms',
  type: 'ui-group',
  name: ' ',
  page: 'weg_d2_pg_alarms',
  width: '24',
  height: '1',
  order: 1,
  showTitle: false,
  className: '',
  visible: 'true',
  disabled: 'false'
});

// ─── 3. Inject to trigger initial load ──────────────────────────────
filtered.push({
  id: 'weg_alarm_sp_init',
  type: 'inject',
  z: TAB,
  name: 'Init Setpoints',
  props: [{ p: 'topic', vt: 'str', v: 'spInit' }],
  repeat: '',
  crontab: '',
  once: true,
  onceDelay: '2',
  topic: 'spInit',
  x: 250,
  y: 770,
  wires: [['weg_alarm_sp_handler']]
});

// ─── 4. Handler (uses libs for fs) ─────────────────────────────────
filtered.push({
  id: 'weg_alarm_sp_handler',
  type: 'function',
  z: TAB,
  name: 'Setpoint Handler',
  libs: [{ var: 'fs', module: 'fs' }],
  func: `const CONFIG_PATH = '/data/poller-config.json';

function readConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(raw);
    } catch(e) {
        node.warn('Cannot read config: ' + e.message);
        return null;
    }
}

function writeConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        return true;
    } catch(e) {
        node.warn('Cannot write config: ' + e.message);
        return false;
    }
}

if (msg.topic === 'spInit') {
    const cfg = readConfig();
    if (!cfg) return { topic: 'spError', payload: 'No se pudo leer config.json' };

    const sp = cfg.alarmSetpoints || { defaults: {}, overrides: {} };
    if (!sp.defaults.CFW900) sp.defaults.CFW900 = { currentHigh:130, tempHigh:90, voltageHigh:750, voltageLow:350, frequencyHigh:65, commErrorMax:20 };
    if (!sp.defaults.SSW900) sp.defaults.SSW900 = { currentHigh:130, tempHigh:90, voltageHigh:480, voltageLow:400, frequencyHigh:0, commErrorMax:20 };

    msg.topic = 'spLoad';
    msg.payload = {
        defaults: sp.defaults,
        overrides: sp.overrides || {},
        devices: (cfg.devices || []).map(d => ({ name: d.name, type: d.type, site: d.site }))
    };
    node.status({fill:'blue', shape:'dot', text: (cfg.devices||[]).length + ' drives loaded'});
    return msg;
}

if (msg.topic === 'spSave') {
    const cfg = readConfig();
    if (!cfg) return { topic: 'spError', payload: 'No se pudo leer config.json' };

    cfg.alarmSetpoints = {
        defaults: msg.payload.defaults,
        overrides: msg.payload.overrides
    };

    if (writeConfig(cfg)) {
        const n = Object.keys(msg.payload.overrides).length;
        node.status({fill:'green', shape:'dot', text: 'Saved ' + n + ' overrides'});
        return { topic: 'spSaved', payload: 'ok' };
    }
    return { topic: 'spError', payload: 'Error escribiendo config.json' };
}

return null;`,
  outputs: 1,
  timeout: '',
  noerr: 0,
  initialize: '',
  finalize: '',
  x: 500,
  y: 770,
  wires: [['weg_alarm_sp_ui']]
});

// ─── 5. UI Template ─────────────────────────────────────────────────
filtered.push({
  id: 'weg_alarm_sp_ui',
  type: 'ui-template',
  z: TAB,
  group: 'weg_d2_g_alarms',
  name: 'Setpoint Editor',
  order: 1,
  width: '24',
  height: '22',
  head: '',
  format: `<template>
  <div style="font-family:Arial,sans-serif;padding:12px;max-width:1200px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <h2 style="margin:0;color:#1a4d8f">⚙️ Setpoints de Alarma por Drive</h2>
        <p style="margin:4px 0 0;color:#666;font-size:13px">Cada drive tiene sus propios limites. Los cambios se aplican automaticamente.</p>
      </div>
      <button @click="saveAll" :disabled="saving || !loaded"
        style="background:#1a4d8f;color:white;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:bold;min-width:180px">
        {{ saving ? 'Guardando...' : '💾 Guardar Setpoints' }}
      </button>
    </div>

    <div v-if="msg2" :style="{padding:'10px 16px',borderRadius:'6px',marginBottom:'12px',background:msg2type==='ok'?'#e8f5e9':'#fbe9e7',color:msg2type==='ok'?'#2e7d32':'#c62828',fontWeight:'bold'}">
      {{ msg2 }}
    </div>

    <div v-if="!loaded" style="text-align:center;padding:40px;color:#999">
      <p style="font-size:18px">Cargando configuracion...</p>
    </div>

    <div v-for="(drive, idx) in drives" :key="drive.name"
      style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <span style="font-size:20px">{{ drive.type === 'CFW900' ? '🔄' : '⚡' }}</span>
        <strong style="font-size:16px;color:#1a4d8f">{{ drive.name }}</strong>
        <span style="background:#e3f2fd;color:#1565c0;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold">{{ drive.type }}</span>
        <span style="background:#f3e5f5;color:#7b1fa2;padding:2px 10px;border-radius:12px;font-size:12px">{{ drive.site }}</span>
        <span v-if="hasOverride(drive)" style="background:#fff3e0;color:#e65100;padding:2px 10px;border-radius:12px;font-size:11px">● Personalizado</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
        <div v-for="sp in spFields" :key="sp.key"
          :style="{display:'flex',flexDirection:'column',padding:'8px',borderRadius:'6px',background: isOverridden(drive,sp.key) ? '#fff8e1' : '#fafafa'}">
          <label style="font-size:11px;color:#666;margin-bottom:4px;font-weight:bold">{{ sp.label }}</label>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" :step="sp.step" min="0"
              :value="drive.sp[sp.key]"
              @input="updateSp(drive, sp.key, $event.target.value)"
              @focus="$event.target.select()"
              style="width:100%;padding:8px 6px;border:1px solid #ccc;border-radius:4px;font-size:15px;font-weight:bold;text-align:center" />
            <span style="font-size:12px;color:#999;white-space:nowrap;min-width:24px">{{ sp.unit }}</span>
          </div>
        </div>
      </div>

      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button @click="copyToType(drive)"
          style="background:none;border:1px solid #1a4d8f;color:#1a4d8f;padding:5px 14px;border-radius:4px;font-size:12px;cursor:pointer">
          📋 Copiar a todos los {{ drive.type }}
        </button>
        <button @click="resetDrive(drive)"
          style="background:none;border:1px solid #999;color:#666;padding:5px 14px;border-radius:4px;font-size:12px;cursor:pointer">
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
      loaded: false,
      saving: false,
      msg2: '',
      msg2type: 'ok',
      spFields: [
        { key: 'currentHigh', label: 'Corriente Alta', unit: 'A', step: 1 },
        { key: 'tempHigh', label: 'Temp. Alta', unit: '°C', step: 1 },
        { key: 'voltageHigh', label: 'Voltaje Alto', unit: 'V', step: 10 },
        { key: 'voltageLow', label: 'Voltaje Bajo', unit: 'V', step: 10 },
        { key: 'frequencyHigh', label: 'Frec. Alta', unit: 'Hz', step: 1 },
        { key: 'commErrorMax', label: 'Err. Comm Max', unit: '#', step: 1 }
      ]
    }
  },
  watch: {
    msg: {
      handler(val) {
        if (!val || !val.topic) return;
        if (val.topic === 'spLoad') {
          this.defaults = val.payload.defaults || {};
          const devices = val.payload.devices || [];
          const overrides = val.payload.overrides || {};
          this.drives = devices.map(d => {
            const td = this.defaults[d.type] || {};
            const ov = overrides[d.name] || {};
            return { name: d.name, type: d.type, site: d.site, sp: { ...td, ...ov } };
          });
          this.loaded = true;
        }
        if (val.topic === 'spSaved') {
          this.saving = false;
          this.msg2 = '✅ Setpoints guardados. El poller los aplica automaticamente.';
          this.msg2type = 'ok';
          setTimeout(() => { this.msg2 = ''; }, 4000);
        }
        if (val.topic === 'spError') {
          this.saving = false;
          this.msg2 = '❌ Error: ' + (val.payload || '');
          this.msg2type = 'error';
        }
      },
      deep: true
    }
  },
  methods: {
    updateSp(drive, key, val) {
      drive.sp[key] = Number(val);
    },
    hasOverride(drive) {
      const td = this.defaults[drive.type] || {};
      return Object.keys(drive.sp).some(k => drive.sp[k] !== td[k]);
    },
    isOverridden(drive, key) {
      const td = this.defaults[drive.type] || {};
      return drive.sp[key] !== td[key];
    },
    saveAll() {
      this.saving = true;
      const overrides = {};
      this.drives.forEach(d => {
        const td = this.defaults[d.type] || {};
        const diff = {};
        let hasDiff = false;
        Object.keys(d.sp).forEach(k => {
          if (d.sp[k] !== td[k]) { diff[k] = d.sp[k]; hasDiff = true; }
        });
        if (hasDiff) overrides[d.name] = diff;
      });
      this.send({ topic: 'spSave', payload: { defaults: this.defaults, overrides } });
    },
    copyToType(src) {
      this.drives.forEach(d => {
        if (d.type === src.type && d.name !== src.name) d.sp = { ...src.sp };
      });
      this.msg2 = '📋 Copiado a todos los ' + src.type;
      this.msg2type = 'ok';
      setTimeout(() => { this.msg2 = ''; }, 2000);
    },
    resetDrive(drive) {
      drive.sp = { ...(this.defaults[drive.type] || {}) };
    }
  }
}
<\/script>`,
  storeOutMessages: true,
  passthru: false,
  resendOnRefresh: true,
  templateScope: 'widget:ui',
  className: '',
  x: 750,
  y: 770,
  wires: [['weg_alarm_sp_handler']]
});

// ─── 6. Comment ─────────────────────────────────────────────────────
filtered.push({
  id: 'weg_comment_sp_page',
  type: 'comment',
  z: TAB,
  name: '─── ALARM SETPOINTS PAGE ───',
  info: '',
  x: 250,
  y: 740,
  wires: []
});

// ─── Save ───────────────────────────────────────────────────────────
fs.writeFileSync(FLOWS_PATH, JSON.stringify(filtered, null, 2));
console.log('✅ Alarm setpoints page rebuilt');
console.log('   - Inject trigger on deploy (avoids D2 mounted race)');
console.log('   - Handler uses libs:[fs] for file access');
console.log('   - resendOnRefresh: true for page navigation');
