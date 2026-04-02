var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. CONFIG PAGE + GROUP
// ============================================================
if (!f.find(function(n){return n.id==='weg_d2_pg_config'})) {
    f.push({id:'weg_d2_pg_config',type:'ui-page',name:'Configuración',ui:'weg_d2_base',path:'/config',icon:'mdi-cog',layout:'grid',theme:'weg_d2_theme',order:10});
}
if (!f.find(function(n){return n.id==='weg_d2_g_config'})) {
    f.push({id:'weg_d2_g_config',type:'ui-group',name:'Ajuste de Zonas',page:'weg_d2_pg_config',width:'12',height:'8',order:1});
}

// ============================================================
// 2. CONFIG FORM TEMPLATE (Vuetify + password)
// ============================================================
var defaults = {
    velocidad: {min:0,max:1800,green:1200,yellow:1500,label:'Velocidad',unit:'RPM'},
    corriente: {min:0,max:150,green:80,yellow:120,label:'Corriente',unit:'A'},
    tension:   {min:0,max:500,green:380,yellow:480,label:'Tensión',unit:'V'},
    frecuencia:{min:0,max:70,green:50,yellow:62,label:'Frecuencia',unit:'Hz'},
    potencia:  {min:0,max:100,green:60,yellow:85,label:'Potencia',unit:'kW'},
    temperatura:{min:-10,max:150,green:80,yellow:120,label:'Temp. Motor',unit:'°C'}
};

var formTemplate = [
'<template>',
'<div>',
'  <!-- PASSWORD DIALOG -->',
'  <v-dialog v-model="showLogin" persistent max-width="400">',
'    <v-card>',
'      <v-card-title style="font-weight:700">🔒 Acceso Restringido</v-card-title>',
'      <v-card-text>',
'        <p style="color:#666">Ingrese la contraseña para acceder a la configuración.</p>',
'        <v-text-field v-model="password" label="Contraseña" type="password" variant="outlined"',
'          @keyup.enter="checkPassword" :error-messages="loginError"></v-text-field>',
'      </v-card-text>',
'      <v-card-actions>',
'        <v-spacer></v-spacer>',
'        <v-btn color="primary" @click="checkPassword" :loading="checking">Ingresar</v-btn>',
'      </v-card-actions>',
'    </v-card>',
'  </v-dialog>',
'',
'  <!-- SETTINGS FORM (only visible after auth) -->',
'  <div v-if="authenticated">',
'    <v-alert type="info" variant="tonal" density="compact" class="mb-4" style="font-family:monospace">',
'      Ajuste los umbrales de las zonas de color para cada gauge. Los cambios se aplican inmediatamente.',
'    </v-alert>',
'',
'    <div v-for="(cfg, key) in config" :key="key" style="margin-bottom:16px">',
'      <v-card variant="outlined" rounded="lg">',
'        <v-card-title style="font-size:1em;font-weight:700;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb">',
'          {{ cfg.label }} <span style="color:#999;font-weight:400;font-size:0.8em">({{ cfg.unit }})</span>',
'        </v-card-title>',
'        <v-card-text style="padding:12px 16px">',
'          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;align-items:end">',
'            <v-text-field v-model.number="cfg.min" label="Mínimo" type="number" variant="outlined" density="compact" hide-details></v-text-field>',
'            <v-text-field v-model.number="cfg.green" type="number" variant="outlined" density="compact" hide-details>',
'              <template v-slot:label><span style="color:#22c55e;font-weight:600">🟢 Verde → Amarillo</span></template>',
'            </v-text-field>',
'            <v-text-field v-model.number="cfg.yellow" type="number" variant="outlined" density="compact" hide-details>',
'              <template v-slot:label><span style="color:#f59e0b;font-weight:600">🟡 Amarillo → Rojo</span></template>',
'            </v-text-field>',
'            <v-text-field v-model.number="cfg.max" label="Máximo" type="number" variant="outlined" density="compact" hide-details></v-text-field>',
'          </div>',
'          <div style="display:flex;gap:4px;margin-top:8px;height:8px;border-radius:4px;overflow:hidden">',
'            <div :style="{flex:cfg.green-cfg.min,background:\'#22c55e\'}"></div>',
'            <div :style="{flex:cfg.yellow-cfg.green,background:\'#f59e0b\'}"></div>',
'            <div :style="{flex:cfg.max-cfg.yellow,background:\'#ef4444\'}"></div>',
'          </div>',
'        </v-card-text>',
'      </v-card>',
'    </div>',
'',
'    <div style="display:flex;gap:12px;margin-top:8px">',
'      <v-btn color="primary" size="large" @click="saveConfig" prepend-icon="mdi-content-save">Guardar Configuración</v-btn>',
'      <v-btn variant="outlined" size="large" @click="resetDefaults" prepend-icon="mdi-restore">Restaurar Defaults</v-btn>',
'    </div>',
'',
'    <v-snackbar v-model="saved" color="success" timeout="3000">✅ Configuración guardada</v-snackbar>',
'',
'    <v-divider class="my-6"></v-divider>',
'    <v-card variant="outlined" rounded="lg">',
'      <v-card-title style="font-size:1em;font-weight:700;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb">🔑 Cambiar Contraseña</v-card-title>',
'      <v-card-text style="padding:12px 16px">',
'        <div style="display:flex;gap:12px;align-items:end">',
'          <v-text-field v-model="newPassword" label="Nueva contraseña" type="password" variant="outlined" density="compact" hide-details style="max-width:300px"></v-text-field>',
'          <v-btn color="warning" @click="changePassword" prepend-icon="mdi-key">Cambiar</v-btn>',
'        </div>',
'      </v-card-text>',
'    </v-card>',
'    <v-snackbar v-model="pwChanged" color="warning" timeout="3000">🔑 Contraseña actualizada</v-snackbar>',
'  </div>',
'</div>',
'</template>',
'',
'<script>',
'export default {',
'  data() {',
'    return {',
'      showLogin: true,',
'      authenticated: false,',
'      password: "",',
'      loginError: "",',
'      checking: false,',
'      saved: false,',
'      pwChanged: false,',
'      newPassword: "",',
'      config: ' + JSON.stringify(defaults),
'    }',
'  },',
'  mounted() {',
'    // Load saved config if exists',
'    this.send({topic: "load"});',
'  },',
'  watch: {',
'    msg(val) {',
'      if (val?.topic === "config" && val.payload) {',
'        this.config = val.payload;',
'      }',
'      if (val?.topic === "auth") {',
'        if (val.payload === true) { this.authenticated = true; this.showLogin = false; this.loginError = ""; }',
'        else { this.loginError = "Contraseña incorrecta"; this.checking = false; }',
'      }',
'    }',
'  },',
'  methods: {',
'    checkPassword() {',
'      this.checking = true;',
'      this.send({topic: "auth", payload: this.password});',
'    },',
'    saveConfig() {',
'      this.send({topic: "save", payload: JSON.parse(JSON.stringify(this.config))});',
'      this.saved = true;',
'    },',
'    resetDefaults() {',
'      this.config = ' + JSON.stringify(defaults) + ';',
'      this.saveConfig();',
'    },',
'    changePassword() {',
'      if (this.newPassword.length >= 4) {',
'        this.send({topic: "changePassword", payload: this.newPassword});',
'        this.newPassword = "";',
'        this.pwChanged = true;',
'      }',
'    }',
'  }',
'}',
'</script>'
].join('\n');

var formId = 'weg_d2_config_form';
var existing = f.find(function(n){return n.id===formId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: formId, type: 'ui-template', z: 'weg_d2_tab',
    group: 'weg_d2_g_config', name: 'Config Form',
    order: 1, width: '12', height: '8',
    format: formTemplate,
    storeOutMessages: true, fwdInMessages: true, resendOnRefresh: true,
    templateScope: 'local',
    x: 700, y: 400, wires: [['weg_d2_config_handler']]
});

// ============================================================
// 3. CONFIG HANDLER FUNCTION (save/load/auth)
// ============================================================
var handlerId = 'weg_d2_config_handler';
existing = f.find(function(n){return n.id===handlerId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: handlerId, type: 'function', z: 'weg_d2_tab',
    name: 'Config Handler',
    func: [
        'var topic = msg.topic;',
        '',
        'if (topic === "load") {',
        '    var cfg = global.get("gaugeConfig");',
        '    if (cfg) return {topic: "config", payload: cfg};',
        '    return null;',
        '}',
        '',
        'if (topic === "auth") {',
        '    var storedPw = global.get("adminPassword") || "admin123";',
        '    return {topic: "auth", payload: msg.payload === storedPw};',
        '}',
        '',
        'if (topic === "save") {',
        '    global.set("gaugeConfig", msg.payload);',
        '    node.status({fill:"green",shape:"dot",text:"Config saved"});',
        '    return null;',
        '}',
        '',
        'if (topic === "changePassword") {',
        '    global.set("adminPassword", msg.payload);',
        '    node.status({fill:"yellow",shape:"dot",text:"Password changed"});',
        '    return null;',
        '}',
        '',
        'return null;'
    ].join('\n'),
    outputs: 1, x: 900, y: 400, wires: [['weg_d2_config_form']]
});

// ============================================================
// 4. UPDATE SPLITTER to include gaugeConfig
// ============================================================
var splitter = f.find(function(n){return n.id==='weg_d2_splitter'});
if (splitter) {
    // Add gaugeConfig to each drive payload
    splitter.func = splitter.func.replace(
        'outputs.push({payload: d});',
        'var gc = global.get("gaugeConfig") || null;\n        d.gaugeConfig = gc;\n        outputs.push({payload: d});'
    );
    // Also add to offline placeholder
    splitter.func = splitter.func.replace(
        "hoursEnergized: '-', hoursEnabled: '-'",
        "hoursEnergized: '-', hoursEnabled: '-', gaugeConfig: global.get('gaugeConfig') || null"
    );
    console.log('Splitter updated with gaugeConfig');
}

// ============================================================
// 5. UPDATE CARD TEMPLATE to use dynamic zones
// ============================================================
f.forEach(function(n) {
    if (n.name && n.name.includes('Card') && n.type === 'ui-template' && n.format && n.format.includes('arcPath')) {
        // Replace the hardcoded gauges computed property
        n.format = n.format.replace(
            /gauges\(\) \{[\s\S]*?return \[[\s\S]*?\];[\s\S]*?\}/,
            `gauges() {
      var d = this.d;
      var gc = d.gaugeConfig || {};
      var v = gc.velocidad || {min:0,max:1800,green:1200,yellow:1500};
      var c = gc.corriente || {min:0,max:150,green:80,yellow:120};
      var t = gc.tension || {min:0,max:500,green:380,yellow:480};
      var fr = gc.frecuencia || {min:0,max:70,green:50,yellow:62};
      return [
        {label:'Velocidad', value:d.motorSpeed, unit:'RPM', pct:v.max>0?Math.min(d.motorSpeed/v.max*100,100):0, color: d.motorSpeed>=v.yellow?'#ef4444':d.motorSpeed>=v.green?'#f59e0b':'#3b82f6', min:v.min, max:v.max},
        {label:'Corriente', value:d.current?.toFixed(1)||'0', unit:'A', pct:c.max>0?Math.min(d.current/c.max*100,100):0, color: d.current>=c.yellow?'#ef4444':d.current>=c.green?'#f59e0b':'#06b6d4', min:c.min, max:c.max},
        {label:'Tension', value:d.outputVoltage, unit:'V', pct:t.max>0?Math.min(d.outputVoltage/t.max*100,100):0, color: d.outputVoltage>=t.yellow?'#ef4444':d.outputVoltage>=t.green?'#f59e0b':'#f59e0b', min:t.min, max:t.max},
        {label:'Frecuencia', value:d.frequency?.toFixed(1)||'0', unit:'Hz', pct:fr.max>0?Math.min(d.frequency/fr.max*100,100):0, color: d.frequency>=fr.yellow?'#ef4444':d.frequency>=fr.green?'#f59e0b':'#22c55e', min:fr.min, max:fr.max}
      ];
    }`
        );

        // Also update the potencia and temp metrics to use config
        n.format = n.format.replace(
            "d.motorTemp>100?'#ef4444':d.motorTemp>60?'#f59e0b':'#22c55e'",
            "(d.gaugeConfig?.temperatura?.yellow||120)<=d.motorTemp?'#ef4444':(d.gaugeConfig?.temperatura?.green||80)<=d.motorTemp?'#f59e0b':'#22c55e'"
        );

        console.log('Updated card:', n.name);
    }
});

// ============================================================
// 6. INIT node to set default password
// ============================================================
if (!f.find(function(n){return n.id==='weg_d2_config_init'})) {
    f.push({
        id: 'weg_d2_config_init', type: 'inject', z: 'weg_d2_tab',
        name: 'Init Config Defaults', repeat: '', once: true, onceDelay: '2',
        topic: '', props: [],
        x: 250, y: 400, wires: [['weg_d2_config_init_fn']]
    });
    f.push({
        id: 'weg_d2_config_init_fn', type: 'function', z: 'weg_d2_tab',
        name: 'Set Defaults',
        func: 'if (!global.get("adminPassword")) global.set("adminPassword", "admin123");\nif (!global.get("gaugeConfig")) global.set("gaugeConfig", ' + JSON.stringify(defaults) + ');\nreturn null;',
        outputs: 1, x: 450, y: 400, wires: [[]]
    });
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Config page built with auth + form + handler');
