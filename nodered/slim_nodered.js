/**
 * slim_nodered.js - Remove business logic from Node-RED, keep only dashboard
 *
 * KEEPS: MQTT bridge, site splitter, dashboard templates, inject ticks
 * REMOVES: config handler, reports, alerts, setpoints, grafana updater
 * REPLACES: config/report/alarm pages with API-backed versions
 *
 * Apply inside container:
 *   node /data/slim_nodered.js
 */

var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Nodes to remove (business logic migrated to weg-api)
var removeIds = [
  // Config logic
  'weg_d2_config_handler', 'weg_d2_config_init', 'weg_d2_config_init_fn',
  'weg_config_file_write',
  // Grafana updater
  'weg_grafana_updater', 'weg_grafana_http', 'weg_grafana_init', 'weg_grafana_status',
  // Reports
  'weg_d2_report_handler', 'weg_d2_report_http', 'weg_d2_report_http_resp',
  'weg_d2_report_emailer', 'weg_d2_report_cron_fn', 'weg_d2_report_pdfgen',
  'weg_d2_report_scheduler',
  // Alerts
  'weg_alarm_detector', 'weg_rate_limiter', 'weg_format_telegram', 'weg_format_email',
  'weg_telegram_out', 'weg_email_out', 'weg_telegram_bot_config',
  // Setpoints
  'weg_alarm_sp_handler', 'weg_alarm_sp_init',
  // Rename handler (unused)
  'weg_rename_handler',
  // Comments
  'weg_comment_alarms', 'weg_comment_sp_page'
];

var removeSet = {};
removeIds.forEach(function(id) { removeSet[id] = true; });

var before = f.length;
f = f.filter(function(n) { return !removeSet[n.id]; });
console.log('Removed ' + (before - f.length) + ' nodes');

// Fix wires: remove references to deleted nodes
f.forEach(function(n) {
  if (!n.wires) return;
  n.wires = n.wires.map(function(outputs) {
    if (!Array.isArray(outputs)) return outputs;
    return outputs.filter(function(id) { return !removeSet[id]; });
  });
});

// Fix MQTT bridge: was wired to alarm_detector, now just goes to splitter flow
var bridge = f.find(function(n) { return n.id === 'weg_mqtt_bridge'; });
if (bridge) {
  // Keep only existing valid targets
  console.log('MQTT bridge wires cleaned');
}

// ─── Replace Config page template with API-backed version ───────────
var configForm = f.find(function(n) { return n.id === 'weg_d2_config_form'; });
if (configForm) {
  configForm.format = [
    '<template>',
    '<div style="width:100%;padding:16px">',
    '  <h2 style="color:#1a4d8f;margin:0 0 8px">Configuracion</h2>',
    '  <p style="color:#666">Gestionado desde la API. Accede a <a href="/api/config" target="_blank">weg-api</a> en puerto 3200.</p>',
    '  <iframe src="http://localhost:3200/health" style="border:1px solid #ddd;border-radius:8px;width:100%;height:60px;margin-top:12px"></iframe>',
    '</div>',
    '</template>'
  ].join('\n');
  console.log('Config page: replaced with API pointer');
}

// ─── Replace Report page template with API-backed version ───────────
var reportForm = f.find(function(n) { return n.id === 'weg_d2_report_form'; });
if (reportForm) {
  reportForm.format = [
    '<template>',
    '<div style="width:100%;padding:16px">',
    '  <h2 style="color:#1a4d8f;margin:0 0 16px">Reportes</h2>',
    '  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">',
    '    <div style="display:flex;flex-direction:column;gap:4px">',
    '      <label style="font-size:12px;color:#666;font-weight:bold">Desde</label>',
    '      <select v-model="fromRange" style="padding:8px;border:1px solid #ccc;border-radius:4px;font-size:14px">',
    '        <option value="-1h">Ultima hora</option>',
    '        <option value="-6h">Ultimas 6 horas</option>',
    '        <option value="-24h">Ultimas 24 horas</option>',
    '        <option value="-7d">Ultima semana</option>',
    '        <option value="-30d">Ultimo mes</option>',
    '      </select>',
    '    </div>',
    '    <button @click="downloadCSV" :disabled="loading" style="align-self:flex-end;background:#1a4d8f;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold">',
    '      {{ loading ? "Generando..." : "Descargar CSV" }}',
    '    </button>',
    '    <button @click="downloadPDF" :disabled="loading" style="align-self:flex-end;background:#c62828;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold">',
    '      {{ loading ? "Generando..." : "Descargar PDF" }}',
    '    </button>',
    '  </div>',
    '  <div v-if="info" style="padding:10px;border-radius:6px;background:#e8f5e9;color:#2e7d32;font-weight:bold">{{ info }}</div>',
    '</div>',
    '</template>',
    '<script>',
    'export default {',
    '  data: function() {',
    '    return { fromRange: "-24h", loading: false, info: "" }',
    '  },',
    '  methods: {',
    '    downloadCSV: function() {',
    '      this.loading = true;',
    '      this.info = "";',
    '      var self = this;',
    '      fetch("http://" + window.location.hostname + ":3200/api/reports/csv", {',
    '        method: "POST",',
    '        headers: { "Content-Type": "application/json" },',
    '        body: JSON.stringify({ from: this.fromRange })',
    '      }).then(function(r) { return r.blob(); }).then(function(blob) {',
    '        var a = document.createElement("a");',
    '        a.href = URL.createObjectURL(blob);',
    '        a.download = "weg-report.csv";',
    '        a.click();',
    '        self.loading = false;',
    '        self.info = "CSV descargado";',
    '        setTimeout(function() { self.info = ""; }, 3000);',
    '      }).catch(function(e) { self.loading = false; self.info = "Error: " + e.message; });',
    '    },',
    '    downloadPDF: function() {',
    '      this.loading = true;',
    '      this.info = "";',
    '      var self = this;',
    '      fetch("http://" + window.location.hostname + ":3200/api/reports/pdf", {',
    '        method: "POST",',
    '        headers: { "Content-Type": "application/json" },',
    '        body: JSON.stringify({ from: this.fromRange, title: "Reporte WEG SCADA" })',
    '      }).then(function(r) { return r.blob(); }).then(function(blob) {',
    '        var a = document.createElement("a");',
    '        a.href = URL.createObjectURL(blob);',
    '        a.download = "weg-report.pdf";',
    '        a.click();',
    '        self.loading = false;',
    '        self.info = "PDF descargado";',
    '        setTimeout(function() { self.info = ""; }, 3000);',
    '      }).catch(function(e) { self.loading = false; self.info = "Error: " + e.message; });',
    '    }',
    '  }',
    '}',
    '<' + '/script>'
  ].join('\n');
  reportForm.width = '24';
  console.log('Report page: replaced with API-backed CSV/PDF downloader');
}

// ─── Replace Alarm page template with API-backed version ────────────
var alarmUI = f.find(function(n) { return n.id === 'weg_alarm_sp_ui'; });
if (alarmUI) {
  alarmUI.format = [
    '<template>',
    '<div style="width:100%;padding:12px">',
    '  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">',
    '    <h2 style="margin:0;color:#1a4d8f">Setpoints de Alarma por Drive</h2>',
    '    <button @click="doSave" :disabled="saving" style="background:#1a4d8f;color:white;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:bold">',
    '      {{ saving ? "Guardando..." : "Guardar Setpoints" }}',
    '    </button>',
    '  </div>',
    '  <div v-if="info" style="padding:10px;border-radius:6px;margin-bottom:12px;background:#e8f5e9;color:#2e7d32;font-weight:bold">{{ info }}</div>',
    '  <div v-if="!loaded" style="text-align:center;padding:40px;color:#999">Cargando...</div>',
    '  <div v-for="d in drives" :key="d.name" style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;width:100%">',
    '    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">',
    '      <strong style="font-size:16px;color:#1a4d8f">{{ d.name }}</strong>',
    '      <span style="background:#e3f2fd;color:#1565c0;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold">{{ d.type }}</span>',
    '      <span style="background:#f3e5f5;color:#7b1fa2;padding:2px 10px;border-radius:12px;font-size:12px">{{ d.site }}</span>',
    '    </div>',
    '    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">',
    '      <div style="padding:8px;border-radius:6px;background:#fafafa">',
    '        <label style="font-size:11px;color:#666;font-weight:bold;display:block;margin-bottom:4px">Corriente Alta (A)</label>',
    '        <input type="number" step="1" min="0" v-model.number="d.sp.currentHigh" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:15px;font-weight:bold;text-align:center" />',
    '      </div>',
    '      <div style="padding:8px;border-radius:6px;background:#fafafa">',
    '        <label style="font-size:11px;color:#666;font-weight:bold;display:block;margin-bottom:4px">Temp. Alta (C)</label>',
    '        <input type="number" step="1" min="0" v-model.number="d.sp.tempHigh" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:15px;font-weight:bold;text-align:center" />',
    '      </div>',
    '    </div>',
    '    <div style="margin-top:10px;display:flex;gap:8px">',
    '      <button @click="copyType(d)" style="background:none;border:1px solid #1a4d8f;color:#1a4d8f;padding:5px 14px;border-radius:4px;font-size:12px;cursor:pointer">Copiar a todos los {{ d.type }}</button>',
    '      <button @click="resetOne(d)" style="background:none;border:1px solid #999;color:#666;padding:5px 14px;border-radius:4px;font-size:12px;cursor:pointer">Restaurar defaults</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '</template>',
    '<script>',
    'export default {',
    '  data: function() {',
    '    return { drives: [], defs: {}, loaded: false, saving: false, info: "" }',
    '  },',
    '  mounted: function() { this.loadData(); },',
    '  methods: {',
    '    loadData: function() {',
    '      var self = this;',
    '      fetch("http://" + window.location.hostname + ":3200/api/setpoints")',
    '        .then(function(r) { return r.json(); })',
    '        .then(function(data) {',
    '          self.defs = data.defaults || {};',
    '          self.drives = (data.devices || []).map(function(d) {',
    '            return { name: d.name, type: d.type, site: d.site, sp: Object.assign({}, d.setpoints) };',
    '          });',
    '          self.loaded = true;',
    '        })',
    '        .catch(function(e) { self.info = "Error cargando: " + e.message; });',
    '    },',
    '    doSave: function() {',
    '      this.saving = true;',
    '      var ovr = {};',
    '      var self = this;',
    '      this.drives.forEach(function(d) {',
    '        var td = self.defs[d.type] || {};',
    '        var diff = {};',
    '        var has = false;',
    '        Object.keys(d.sp).forEach(function(k) {',
    '          if (d.sp[k] !== td[k]) { diff[k] = d.sp[k]; has = true; }',
    '        });',
    '        if (has) ovr[d.name] = diff;',
    '      });',
    '      fetch("http://" + window.location.hostname + ":3200/api/setpoints/bulk", {',
    '        method: "PUT",',
    '        headers: { "Content-Type": "application/json" },',
    '        body: JSON.stringify({ defaults: self.defs, overrides: ovr })',
    '      }).then(function() {',
    '        self.saving = false;',
    '        self.info = "Setpoints guardados";',
    '        setTimeout(function() { self.info = ""; }, 3000);',
    '      }).catch(function(e) { self.saving = false; self.info = "Error: " + e.message; });',
    '    },',
    '    copyType: function(src) {',
    '      var self = this;',
    '      this.drives.forEach(function(d) {',
    '        if (d.type === src.type && d.name !== src.name) d.sp = Object.assign({}, src.sp);',
    '      });',
    '      this.info = "Copiado a todos los " + src.type;',
    '      setTimeout(function() { self.info = ""; }, 2000);',
    '    },',
    '    resetOne: function(d) {',
    '      d.sp = Object.assign({}, this.defs[d.type] || {});',
    '    }',
    '  }',
    '}',
    '<' + '/script>'
  ].join('\n');
  // Remove wire to deleted handler
  alarmUI.wires = [[]];
  console.log('Alarm page: replaced with API-backed version (fetch from :3200)');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));

var remaining = f.filter(function(n) { return n.type === 'function'; });
console.log('--- Remaining function nodes: ' + remaining.length + ' ---');
remaining.forEach(function(n) { console.log('  ' + n.name); });
