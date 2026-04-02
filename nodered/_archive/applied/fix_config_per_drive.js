var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var defaults = {
    velocidad: {min:0,max:1800,green:1200,yellow:1500,label:'Velocidad',unit:'RPM'},
    corriente: {min:0,max:150,green:80,yellow:120,label:'Corriente',unit:'A'},
    tension:   {min:0,max:500,green:380,yellow:480,label:'Tensión',unit:'V'},
    frecuencia:{min:0,max:70,green:50,yellow:62,label:'Frecuencia',unit:'Hz'},
    potencia:  {min:0,max:100,green:60,yellow:85,label:'Potencia',unit:'kW'},
    temperatura:{min:-10,max:150,green:80,yellow:120,label:'Temp. Motor',unit:'°C'}
};

var defaultsStr = JSON.stringify(defaults);

// Build per-drive config form
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
'      <v-card-actions><v-spacer></v-spacer><v-btn color="primary" @click="checkPassword">Ingresar</v-btn></v-card-actions>',
'    </v-card>',
'  </v-dialog>',
'',
'  <div v-if="authenticated">',
'    <!-- DRIVE SELECTOR TABS -->',
'    <v-tabs v-model="selectedDrive" color="primary" class="mb-4">',
'      <v-tab v-for="(drive, idx) in drives" :key="idx" :value="idx">',
'        <v-icon start>mdi-engine</v-icon>{{ drive.name }}',
'      </v-tab>',
'    </v-tabs>',
'',
'    <!-- CONFIG FOR SELECTED DRIVE -->',
'    <v-window v-model="selectedDrive">',
'      <v-window-item v-for="(drive, dIdx) in drives" :key="dIdx" :value="dIdx">',
'        <v-alert type="info" variant="tonal" density="compact" class="mb-3" style="font-family:monospace;font-size:0.85em">',
'          {{ drive.name }} — {{ drive.ip }}',
'        </v-alert>',
'',
'        <div v-for="(cfg, key) in drive.config" :key="key" style="margin-bottom:12px">',
'          <v-card variant="outlined" rounded="lg">',
'            <v-card-title style="font-size:0.95em;font-weight:700;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb">',
'              {{ cfg.label }} <span style="color:#999;font-weight:400;font-size:0.8em">({{ cfg.unit }})</span>',
'            </v-card-title>',
'            <v-card-text style="padding:10px 16px">',
'              <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;align-items:end">',
'                <v-text-field v-model.number="cfg.min" label="Mínimo" type="number" variant="outlined" density="compact" hide-details></v-text-field>',
'                <v-text-field v-model.number="cfg.green" type="number" variant="outlined" density="compact" hide-details>',
'                  <template v-slot:label><span style="color:#22c55e;font-weight:600">🟢 → 🟡</span></template>',
'                </v-text-field>',
'                <v-text-field v-model.number="cfg.yellow" type="number" variant="outlined" density="compact" hide-details>',
'                  <template v-slot:label><span style="color:#f59e0b;font-weight:600">🟡 → 🔴</span></template>',
'                </v-text-field>',
'                <v-text-field v-model.number="cfg.max" label="Máximo" type="number" variant="outlined" density="compact" hide-details></v-text-field>',
'              </div>',
'              <div style="display:flex;gap:3px;margin-top:6px;height:6px;border-radius:3px;overflow:hidden">',
'                <div :style="{flex:Math.max(cfg.green-cfg.min,1),background:\'#22c55e\'}"></div>',
'                <div :style="{flex:Math.max(cfg.yellow-cfg.green,1),background:\'#f59e0b\'}"></div>',
'                <div :style="{flex:Math.max(cfg.max-cfg.yellow,1),background:\'#ef4444\'}"></div>',
'              </div>',
'            </v-card-text>',
'          </v-card>',
'        </div>',
'',
'        <div style="display:flex;gap:12px;margin-top:4px">',
'          <v-btn color="primary" @click="saveDrive(dIdx)" prepend-icon="mdi-content-save">Guardar {{ drive.name }}</v-btn>',
'          <v-btn variant="outlined" @click="resetDrive(dIdx)" prepend-icon="mdi-restore">Defaults</v-btn>',
'          <v-btn variant="text" color="secondary" @click="copyToAll(dIdx)" prepend-icon="mdi-content-copy">Copiar a todos</v-btn>',
'        </div>',
'      </v-window-item>',
'    </v-window>',
'',
'    <v-snackbar v-model="saved" color="success" timeout="2000">✅ Configuración guardada</v-snackbar>',
'',
'    <v-divider class="my-4"></v-divider>',
'    <v-card variant="outlined" rounded="lg">',
'      <v-card-title style="font-size:0.95em;font-weight:700;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb">🔑 Cambiar Contraseña</v-card-title>',
'      <v-card-text style="padding:10px 16px">',
'        <div style="display:flex;gap:12px;align-items:end">',
'          <v-text-field v-model="newPassword" label="Nueva contraseña" type="password" variant="outlined" density="compact" hide-details style="max-width:300px"></v-text-field>',
'          <v-btn color="warning" @click="changePassword" prepend-icon="mdi-key">Cambiar</v-btn>',
'        </div>',
'      </v-card-text>',
'    </v-card>',
'    <v-snackbar v-model="pwChanged" color="warning" timeout="2000">🔑 Contraseña actualizada</v-snackbar>',
'  </div>',
'</div>',
'</template>',
'',
'<script>',
'var DEFAULTS = ' + defaultsStr + ';',
'export default {',
'  data() {',
'    return {',
'      showLogin: true, authenticated: false, password: "", loginError: "",',
'      saved: false, pwChanged: false, newPassword: "",',
'      selectedDrive: 0,',
'      drives: [',
'        {name:"CFW900 #1",ip:"192.168.10.100",config:JSON.parse(JSON.stringify(DEFAULTS))},',
'        {name:"CFW900 #2",ip:"192.168.10.101",config:JSON.parse(JSON.stringify(DEFAULTS))},',
'        {name:"CFW900 #3",ip:"192.168.10.102",config:JSON.parse(JSON.stringify(DEFAULTS))},',
'        {name:"CFW900 #4",ip:"192.168.10.103",config:JSON.parse(JSON.stringify(DEFAULTS))},',
'        {name:"SSW900 #1",ip:"RTU Addr 5",config:JSON.parse(JSON.stringify(DEFAULTS))},',
'        {name:"SSW900 #2",ip:"RTU Addr 6",config:JSON.parse(JSON.stringify(DEFAULTS))}',
'      ]',
'    }',
'  },',
'  mounted() { this.send({topic:"load"}); },',
'  watch: {',
'    msg(val) {',
'      if (val?.topic==="config"&&val.payload) {',
'        for (var i=0;i<this.drives.length;i++) {',
'          if (val.payload[i]) this.drives[i].config=val.payload[i];',
'        }',
'      }',
'      if (val?.topic==="auth") {',
'        if (val.payload===true){this.authenticated=true;this.showLogin=false;this.loginError="";}',
'        else{this.loginError="Contraseña incorrecta";}',
'      }',
'    }',
'  },',
'  methods: {',
'    checkPassword() { this.send({topic:"auth",payload:this.password}); },',
'    saveDrive(idx) {',
'      var allConfigs=this.drives.map(function(d){return JSON.parse(JSON.stringify(d.config))});',
'      this.send({topic:"save",payload:allConfigs});',
'      this.saved=true;',
'    },',
'    resetDrive(idx) {',
'      this.drives[idx].config=JSON.parse(JSON.stringify(DEFAULTS));',
'      this.saveDrive(idx);',
'    },',
'    copyToAll(srcIdx) {',
'      var src=JSON.stringify(this.drives[srcIdx].config);',
'      for(var i=0;i<this.drives.length;i++) this.drives[i].config=JSON.parse(src);',
'      this.saveDrive(srcIdx);',
'    },',
'    changePassword() {',
'      if(this.newPassword.length>=4){this.send({topic:"changePassword",payload:this.newPassword});this.newPassword="";this.pwChanged=true;}',
'    }',
'  }',
'}',
'</script>'
].join('\n');

// Replace the form
var form = f.find(function(n){return n.id==='weg_d2_config_form'});
if (form) {
    form.format = formTemplate;
    console.log('Updated config form to per-drive');
}

// Update handler to save/load array
var handler = f.find(function(n){return n.id==='weg_d2_config_handler'});
if (handler) {
    handler.func = [
        'var topic = msg.topic;',
        'if (topic === "load") {',
        '    var cfg = global.get("gaugeConfigPerDrive");',
        '    if (cfg) return {topic: "config", payload: cfg};',
        '    return null;',
        '}',
        'if (topic === "auth") {',
        '    var storedPw = global.get("adminPassword") || "admin123";',
        '    return {topic: "auth", payload: msg.payload === storedPw};',
        '}',
        'if (topic === "save") {',
        '    global.set("gaugeConfigPerDrive", msg.payload);',
        '    node.status({fill:"green",shape:"dot",text:"Saved " + new Date().toLocaleTimeString()});',
        '    return null;',
        '}',
        'if (topic === "changePassword") {',
        '    global.set("adminPassword", msg.payload);',
        '    return null;',
        '}',
        'return null;'
    ].join('\n');
    console.log('Updated handler for per-drive config');
}

// Update splitter to pass per-drive config
var splitter = f.find(function(n){return n.id==='weg_d2_splitter'});
if (splitter) {
    splitter.func = splitter.func.replace(
        "var gc = global.get(\"gaugeConfig\") || null;",
        "var allGc = global.get(\"gaugeConfigPerDrive\") || null;\n        var gc = allGc ? allGc[i] : null;"
    );
    console.log('Updated splitter for per-drive config');
}

// Update init defaults
var initFn = f.find(function(n){return n.id==='weg_d2_config_init_fn'});
if (initFn) {
    var defaultArray = [];
    for (var i = 0; i < 6; i++) defaultArray.push(JSON.parse(JSON.stringify(defaults)));
    initFn.func = 'if (!global.get("adminPassword")) global.set("adminPassword", "admin123");\nif (!global.get("gaugeConfigPerDrive")) global.set("gaugeConfigPerDrive", ' + JSON.stringify(defaultArray) + ');\nreturn null;';
    console.log('Updated init defaults for per-drive');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - per-drive config with tabs');
