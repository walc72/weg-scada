var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// The Config page already exists with group "weg_d2_g_config" (title "Ajuste de Zonas")
// We'll add a second template in that group for gauge zone config
// Remove old if exists
f = f.filter(function(n) { return n.id !== 'weg_gauge_zones_ui'; });

var T = [];
T.push('<template>');
T.push('<div style="width:100%;padding:16px;font-family:Arial,sans-serif">');
T.push('  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">');
T.push('    <h2 style="color:#1a4d8f;margin:0">Ajuste de Zonas de Gauges</h2>');
T.push('    <button @click="saveAll" :disabled="saving" style="background:#1a4d8f;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold">');
T.push('      {{ saving ? "Guardando..." : "Guardar Cambios" }}');
T.push('    </button>');
T.push('  </div>');
T.push('  <div v-if="info" style="padding:10px;border-radius:6px;margin-bottom:12px;font-weight:bold" :style="{background:infoOk?\'#e8f5e9\':\'#fbe9e7\',color:infoOk?\'#2e7d32\':\'#c62828\'}">{{info}}</div>');
T.push('  <p style="color:#666;font-size:13px;margin:0 0 16px">Configure los rangos Verde/Amarillo/Rojo para cada gauge de cada drive. Los cambios se aplican en tiempo real.</p>');
// Drive cards
T.push('  <div v-for="d in drives" :key="d.name" style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px">');
T.push('    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">');
T.push('      <strong style="font-size:16px;color:#1a4d8f">{{ d.name }}</strong>');
T.push('      <span :style="{background:d.type===\'CFW900\'?\'#e3f2fd\':\'#f3e5f5\',color:d.type===\'CFW900\'?\'#1565c0\':\'#7b1fa2\',padding:\'2px 10px\',borderRadius:\'12px\',fontSize:\'12px\',fontWeight:\'bold\'}">{{ d.type }}</span>');
T.push('    </div>');
// Gauge zones table
T.push('    <table style="width:100%;border-collapse:collapse">');
T.push('      <tr style="background:#f5f5f5"><th style="padding:8px;text-align:left;font-size:12px">Gauge</th><th style="padding:8px;text-align:center;font-size:12px">Min</th><th style="padding:8px;text-align:center;font-size:12px">Max</th><th style="padding:8px;text-align:center;font-size:12px;color:#22c55e">Verde hasta</th><th style="padding:8px;text-align:center;font-size:12px;color:#f59e0b">Amarillo hasta</th><th style="padding:8px;text-align:center;font-size:12px;color:#ef4444">Rojo desde</th></tr>');
T.push('      <tr v-for="g in gaugeList(d)" :key="g.key" style="border-bottom:1px solid #eee">');
T.push('        <td style="padding:8px;font-weight:bold">{{ g.label }} <span style="color:#999;font-size:11px">({{ g.unit }})</span></td>');
T.push('        <td style="padding:4px;text-align:center"><input type="number" v-model.number="d.zones[g.key].min" style="width:70px;padding:6px;border:1px solid #ccc;border-radius:4px;text-align:center" /></td>');
T.push('        <td style="padding:4px;text-align:center"><input type="number" v-model.number="d.zones[g.key].max" style="width:70px;padding:6px;border:1px solid #ccc;border-radius:4px;text-align:center" /></td>');
T.push('        <td style="padding:4px;text-align:center"><input type="number" v-model.number="d.zones[g.key].green" style="width:70px;padding:6px;border:1px solid #22c55e;border-radius:4px;text-align:center;background:#f0fdf4" /></td>');
T.push('        <td style="padding:4px;text-align:center"><input type="number" v-model.number="d.zones[g.key].yellow" style="width:70px;padding:6px;border:1px solid #f59e0b;border-radius:4px;text-align:center;background:#fffbeb" /></td>');
T.push('        <td style="padding:4px;text-align:center"><span style="color:#999;font-size:12px">auto</span></td>');
T.push('      </tr>');
T.push('    </table>');
T.push('    <div style="margin-top:8px">');
T.push('      <button @click="resetDrive(d)" style="background:none;border:1px solid #999;color:#666;padding:5px 14px;border-radius:4px;font-size:12px;cursor:pointer">Restaurar defaults</button>');
T.push('    </div>');
T.push('  </div>');
T.push('</div>');
T.push('</template>');
T.push('<script>');
T.push('export default {');
T.push('  data: function() {');
T.push('    return {');
T.push('      drives: [], saving: false, info: "", infoOk: true,');
T.push('      defaults: {');
T.push('        CFW900: {');
T.push('          velocidad: { min:0, max:1800, green:1200, yellow:1500 },');
T.push('          corriente: { min:0, max:150, green:80, yellow:120 },');
T.push('          tension: { min:0, max:500, green:380, yellow:480 },');
T.push('          frecuencia: { min:0, max:70, green:50, yellow:62 }');
T.push('        },');
T.push('        SSW900: {');
T.push('          corriente: { min:0, max:800, green:500, yellow:700 },');
T.push('          tension: { min:0, max:500, green:380, yellow:480 }');
T.push('        }');
T.push('      }');
T.push('    }');
T.push('  },');
T.push('  mounted: function() { this.load(); },');
T.push('  methods: {');
T.push('    api: function() { return "http://"+window.location.hostname+":3200"; },');
T.push('    gaugeList: function(d) {');
T.push('      var list = [];');
T.push('      if (d.type === "CFW900") list.push({key:"velocidad",label:"Velocidad",unit:"RPM"});');
T.push('      list.push({key:"corriente",label:"Corriente",unit:"A"});');
T.push('      list.push({key:"tension",label:"Tension",unit:"V"});');
T.push('      if (d.type === "CFW900") list.push({key:"frecuencia",label:"Frecuencia",unit:"Hz"});');
T.push('      return list;');
T.push('    },');
T.push('    getDefaults: function(type) {');
T.push('      var d = this.defaults[type] || this.defaults.CFW900;');
T.push('      var copy = {};');
T.push('      Object.keys(d).forEach(function(k) { copy[k] = JSON.parse(JSON.stringify(d[k])); });');
T.push('      return copy;');
T.push('    },');
T.push('    load: function() {');
T.push('      var self = this;');
T.push('      fetch(self.api()+"/api/config").then(function(r){return r.json()}).then(function(cfg) {');
T.push('        var zones = cfg.gaugeZones || {};');
T.push('        self.drives = (cfg.devices||[]).map(function(dev) {');
T.push('          var dz = self.getDefaults(dev.type);');
T.push('          var saved = zones[dev.name] || {};');
T.push('          Object.keys(saved).forEach(function(k) { if(dz[k]) Object.assign(dz[k], saved[k]); });');
T.push('          return { name:dev.name, type:dev.type, zones:dz };');
T.push('        });');
T.push('      }).catch(function(e) { self.info="Error: "+e.message; self.infoOk=false; });');
T.push('    },');
T.push('    resetDrive: function(d) {');
T.push('      d.zones = this.getDefaults(d.type);');
T.push('    },');
T.push('    saveAll: function() {');
T.push('      this.saving = true; var self = this;');
T.push('      var zones = {};');
T.push('      self.drives.forEach(function(d) { zones[d.name] = d.zones; });');
T.push('      fetch(self.api()+"/api/config",{method:"GET"}).then(function(r){return r.json()}).then(function(cfg) {');
T.push('        cfg.gaugeZones = zones;');
T.push('        return fetch(self.api()+"/api/config",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(cfg)});');
T.push('      }).then(function() {');
T.push('        self.saving=false; self.info="Zonas guardadas"; self.infoOk=true;');
T.push('        setTimeout(function(){self.info=""},3000);');
T.push('      }).catch(function(e) { self.saving=false; self.info="Error: "+e.message; self.infoOk=false; });');
T.push('    }');
T.push('  }');
T.push('}');
T.push('<' + '/script>');

f.push({
  id: 'weg_gauge_zones_ui',
  type: 'ui-template',
  z: 'weg_d2_tab',
  group: 'weg_d2_g_config',
  name: 'Gauge Zones Editor',
  order: 2,
  width: '24',
  height: '20',
  head: '',
  format: T.join('\n'),
  storeOutMessages: true,
  passthru: false,
  resendOnRefresh: true,
  templateScope: 'local',
  className: '',
  x: 450,
  y: 900,
  wires: [[]]
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Gauge zones editor added');
