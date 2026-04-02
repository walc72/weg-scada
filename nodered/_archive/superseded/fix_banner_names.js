var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. Create banner group for Agrocaraya
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_d2_g_banner_agro'; })) {
    f.push({
        id: 'weg_d2_g_banner_agro',
        type: 'ui-group',
        name: 'Banner Agrocaraya',
        page: 'weg_d2_pg_agro',
        width: '24',
        height: '-1',
        order: 0,
        showTitle: false,
        className: '',
        visible: 'true',
        disabled: 'false'
    });
    console.log('Added banner group for Agrocaraya');
}

// ============================================================
// 2. Create banner template for Agrocaraya (same as Agriplus)
// ============================================================
var bannerTemplate = [
'<template>',
'<div v-if="msg?.payload">',
'  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">',
'    <v-alert :color="msg.payload.alertColor || \'#3b82f6\'" :icon="msg.payload.icon || \'mdi-information\'" variant="tonal" density="compact" style="font-family:monospace;font-weight:700;font-size:0.85em;letter-spacing:0.5px;flex:1">{{ msg.payload.text }}</v-alert>',
'    <div style="display:flex;gap:14px;text-align:center;flex-shrink:0">',
'      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace;color:#3b82f6">{{msg.payload.running || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Running</div></div>',
'      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace;color:#22c55e">{{msg.payload.online || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Online</div></div>',
'      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace" :style="{color:msg.payload.faults>0?\'#ef4444\':\'#ddd\'}">{{msg.payload.faults || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Faults</div></div>',
'      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace;color:#94a3b8">{{msg.payload.offline || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Offline</div></div>',
'    </div>',
'  </div>',
'</div>',
'</template>',
'<script>',
'export default {}',
'</script>'
].join('\n');

if (!f.find(function(n){ return n.id === 'weg_d2_banner_agro'; })) {
    f.push({
        id: 'weg_d2_banner_agro',
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_banner_agro',
        name: 'Banner Agrocaraya',
        page: '',
        ui: '',
        templateScope: 'local',
        order: 1,
        width: '24',
        height: '-1',
        head: '',
        format: bannerTemplate,
        storeOutMessages: true,
        passthru: false,
        resendOnRefresh: true,
        className: '',
        x: 520,
        y: 380,
        wires: [[]]
    });
    console.log('Added banner template for Agrocaraya');
}

// ============================================================
// 3. Add rename handler function node
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_rename_handler'; })) {
    f.push({
        id: 'weg_rename_handler',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Rename Handler',
        func: [
            'if (msg.topic !== "rename" || !msg.payload) return null;',
            'var idx = msg.payload.index;',
            'var newName = msg.payload.newName;',
            'if (idx === undefined || !newName) return null;',
            '',
            '// Save to global context',
            'var names = global.get("deviceNames") || {};',
            'names[idx] = newName;',
            'global.set("deviceNames", names);',
            'node.status({fill:"green",shape:"dot",text:"Renamed idx " + idx + " → " + newName});',
            '',
            '// Also update poller config.json',
            'try {',
            '    var configPath = "/data/poller-config.json";',
            '    var cfg = JSON.parse(require("fs").readFileSync(configPath, "utf8"));',
            '    if (cfg.devices && cfg.devices[idx]) {',
            '        cfg.devices[idx].name = newName;',
            '        require("fs").writeFileSync(configPath, JSON.stringify(cfg, null, 2));',
            '        node.status({fill:"green",shape:"dot",text:"Config + context updated: " + newName});',
            '    }',
            '} catch(e) {',
            '    node.warn("Could not update poller config: " + e.message);',
            '}',
            '',
            'return null;'
        ].join('\n'),
        outputs: 0,
        x: 760,
        y: 300,
        wires: []
    });
    console.log('Added rename handler');
}

// ============================================================
// 4. Update splitter to compute per-site stats + merge custom names
// ============================================================
var splitter = f.find(function(n){ return n.id === 'weg_dash_splitter'; });
if (splitter) {
    splitter.func = [
        'var devices = global.get("cfwDevices") || [];',
        'var customNames = global.get("deviceNames") || {};',
        '',
        '// Merge custom names into devices',
        'for (var i = 0; i < devices.length; i++) {',
        '    if (devices[i] && customNames[i]) {',
        '        devices[i].displayName = customNames[i];',
        '    } else if (devices[i]) {',
        '        devices[i].displayName = devices[i].name;',
        '    }',
        '}',
        '',
        'function siteStats(siteName) {',
        '    var total = 0, online = 0, running = 0, faults = 0, faultTexts = [];',
        '    for (var i = 0; i < devices.length; i++) {',
        '        var d = devices[i];',
        '        if (!d || d.site !== siteName) continue;',
        '        total++;',
        '        if (d.online) {',
        '            online++;',
        '            if (d.running) running++;',
        '            if (d.hasFault) { faults++; faultTexts.push((d.displayName||d.name) + ": " + d.faultText); }',
        '        }',
        '    }',
        '    var offline = total - online;',
        '    var alertColor, icon, text;',
        '    if (faultTexts.length > 0) {',
        '        alertColor = "#ef4444"; icon = "mdi-alert"; text = faultTexts.join(" | ");',
        '    } else if (running > 0) {',
        '        alertColor = "#3b82f6"; icon = "mdi-engine"; text = running + "/" + online + " DRIVES EN MARCHA";',
        '    } else if (online > 0) {',
        '        alertColor = "#22c55e"; icon = "mdi-check-circle"; text = online + "/" + total + " DRIVES ONLINE";',
        '    } else {',
        '        alertColor = "#f59e0b"; icon = "mdi-loading"; text = "CONECTANDO...";',
        '    }',
        '    return {payload: {text: text, alertColor: alertColor, icon: icon, running: running, online: online, faults: faults, offline: offline}};',
        '}',
        '',
        'var agri = {payload: devices, site: "Agriplus"};',
        'var agro = {payload: devices, site: "Agrocaraya"};',
        'var bannerAgri = siteStats("Agriplus");',
        'var bannerAgro = siteStats("Agrocaraya");',
        '',
        '// Outputs: 1=Agriplus cards, 2=Agrocaraya cards, 3=Banner Agriplus, 4=Banner Agrocaraya',
        'return [agri, agro, bannerAgri, bannerAgro];'
    ].join('\n');
    splitter.outputs = 4;
    splitter.wires = [['weg_dash_agri_cards'], ['weg_dash_agro_cards'], ['weg_d2_navstats'], ['weg_d2_banner_agro']];
    console.log('Updated splitter: per-site stats + custom names');
}

// ============================================================
// 5. Update card templates: show displayName + edit button
// ============================================================
var cardTemplate = [
'<template>',
'<div>',
'  <div v-if="!devices.length" style="padding:24px;text-align:center;color:#999">',
'    <v-icon size="48" color="grey">mdi-database-off</v-icon>',
'    <div style="margin-top:8px">No hay dispositivos para este sitio</div>',
'  </div>',
'  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:8px">',
'    <v-card v-for="d in devices" :key="d.name" :style="{borderLeft:\'4px solid \' + borderColor(d)}" elevation="2" rounded="lg" class="pa-0">',
'',
'      <!-- STATUS HEADER -->',
'      <v-card-item class="pb-1">',
'        <template v-slot:title>',
'          <div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap">',
'            <span style="font-weight:700;font-size:1.1em">{{ d.displayName || d.name }}</span>',
'            <v-btn icon variant="text" size="x-small" @click="openRename(d)" style="opacity:0.4" title="Renombrar">',
'              <v-icon size="14">mdi-pencil</v-icon>',
'            </v-btn>',
'            <v-chip size="x-small" variant="tonal" :color="d.type===\'SSW900\'?\'purple\':\'blue\'" class="ml-1">{{d.type}}</v-chip>',
'            <span style="color:#999;font-size:0.7em;margin-left:4px;font-family:monospace">{{ d.ip }}</span>',
'          </div>',
'        </template>',
'        <template v-slot:append>',
'          <v-chip :color="chipColor(d)" variant="elevated" size="default" label style="font-weight:800;font-size:0.9em;letter-spacing:0.5px">',
'            <v-icon start :icon="chipIcon(d)"></v-icon>',
'            {{ chipText(d) }}',
'          </v-chip>',
'        </template>',
'      </v-card-item>',
'',
'      <v-divider></v-divider>',
'',
'      <!-- GAUGES ROW -->',
'      <div v-if="d.online" :style="{display:\'grid\',gridTemplateColumns:\'repeat(\'+gaugesFor(d).length+\',1fr)\',gap:\'4px\',padding:\'12px 8px 4px\',textAlign:\'center\'}">',
'        <div v-for="g in gaugesFor(d)" :key="g.label">',
'          <div style="font-size:0.7em;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">{{g.label}}</div>',
'          <svg viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet" style="width:100%;max-width:180px;height:auto;display:block;margin:0 auto">',
'            <circle cx="50" cy="50" r="36" fill="none" :stroke="g.c1" stroke-width="7" opacity="0.3" :stroke-dasharray="g.z1len+\' 226\'" stroke-dashoffset="0" transform="rotate(180,50,50)" stroke-linecap="butt"/>',
'            <circle cx="50" cy="50" r="36" fill="none" :stroke="g.c2" stroke-width="7" opacity="0.3" :stroke-dasharray="g.z2len+\' 226\'" :stroke-dashoffset="\'-\'+g.z1len" transform="rotate(180,50,50)" stroke-linecap="butt"/>',
'            <circle cx="50" cy="50" r="36" fill="none" :stroke="g.c3" stroke-width="7" opacity="0.3" :stroke-dasharray="g.z3len+\' 226\'" :stroke-dashoffset="\'-\'+(g.z1len+g.z2len)" transform="rotate(180,50,50)" stroke-linecap="butt"/>',
'            <circle v-if="g.fillLen>0.5" cx="50" cy="50" r="36" fill="none" :stroke="g.arcColor" stroke-width="7" :stroke-dasharray="g.fillLen+\' 226\'" stroke-dashoffset="0" transform="rotate(180,50,50)" stroke-linecap="round"/>',
'            <text x="50" y="38" text-anchor="middle" fill="#1a1a2e" font-size="17" font-weight="700" font-family="monospace">{{g.value}}</text>',
'            <text x="50" y="51" text-anchor="middle" fill="#999" font-size="10" font-family="monospace">{{g.unit}}</text>',
'          </svg>',
'        </div>',
'      </div>',
'',
'      <!-- OFFLINE -->',
'      <div v-else style="padding:24px;text-align:center;color:#bbb">',
'        <v-icon size="36" color="grey-lighten-1">mdi-power-plug-off</v-icon>',
'        <div style="margin-top:4px;font-size:0.9em">Drive sin conexion</div>',
'      </div>',
'',
'      <!-- METRICS ROW -->',
'      <div v-if="d.online" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:4px 12px 8px">',
'        <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border-left:3px solid #f59e0b">',
'          <div style="font-size:0.75em;color:#999;font-weight:600;text-transform:uppercase">Potencia</div>',
'          <div style="font-size:1.5em;font-weight:700;font-family:monospace">{{fmt(d.power)}} <span style="font-size:0.6em;color:#999">kW</span></div>',
'        </div>',
'        <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border-left:3px solid #8b5cf6">',
'          <div style="font-size:0.75em;color:#999;font-weight:600;text-transform:uppercase">Cos phi</div>',
'          <div style="font-size:1.5em;font-weight:700;font-family:monospace">{{fmt(d.cosPhi)}}</div>',
'        </div>',
'        <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border-left:3px solid" :style="{borderLeftColor: d.motorTemp>100?\'#ef4444\':d.motorTemp>60?\'#f59e0b\':\'#22c55e\'}">',
'          <div style="font-size:0.75em;color:#999;font-weight:600;text-transform:uppercase">Temp. Motor</div>',
'          <div style="font-size:1.5em;font-weight:700;font-family:monospace" :style="{color: d.motorTemp>100?\'#ef4444\':d.motorTemp>60?\'#f59e0b\':\'#22c55e\'}">{{fmtT(d.motorTemp)}} <span style="font-size:0.6em;color:#999">&deg;C</span></div>',
'        </div>',
'      </div>',
'',
'      <!-- FAULT/ALARM -->',
'      <v-alert v-if="d.hasFault" type="error" density="compact" variant="tonal" class="mx-3 mb-2" style="font-family:monospace;font-size:0.85em">',
'        <strong>FALLA:</strong> {{ d.faultText }}',
'      </v-alert>',
'      <v-alert v-if="d.hasAlarm && !d.hasFault" type="warning" density="compact" variant="tonal" class="mx-3 mb-2" style="font-family:monospace;font-size:0.85em">',
'        Alarma: {{ d.alarmText }}',
'      </v-alert>',
'',
'      <!-- FOOTER -->',
'      <v-card-actions v-if="d.online" style="padding:4px 12px 8px;justify-content:space-between">',
'        <span style="font-size:0.7em;color:#bbb;font-family:monospace">',
'          <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>',
'          <template v-if="d.hoursEnergized!==\'-\'">{{d.hoursEnergized}}h encendido | {{d.hoursEnabled}}h habilitado</template>',
'          <template v-else>Soft Starter</template>',
'        </span>',
'        <v-chip :color="d.hasFault?\'red\':\'green\'" variant="tonal" size="x-small" label>',
'          {{ d.hasFault ? d.faultText : \'Sin Falla\' }}',
'        </v-chip>',
'      </v-card-actions>',
'    </v-card>',
'  </div>',
'',
'  <!-- RENAME DIALOG -->',
'  <v-dialog v-model="renameDialog" max-width="400" persistent>',
'    <v-card>',
'      <v-card-title style="font-weight:700">Renombrar Dispositivo</v-card-title>',
'      <v-card-text>',
'        <div style="color:#999;font-size:0.85em;margin-bottom:8px">Nombre actual: {{ renameOld }}</div>',
'        <v-text-field v-model="renameName" label="Nuevo nombre" variant="outlined" density="compact" autofocus @keyup.enter="saveRename"></v-text-field>',
'      </v-card-text>',
'      <v-card-actions>',
'        <v-spacer></v-spacer>',
'        <v-btn variant="text" @click="renameDialog=false">Cancelar</v-btn>',
'        <v-btn color="blue" variant="elevated" @click="saveRename" :disabled="!renameName.trim()">Guardar</v-btn>',
'      </v-card-actions>',
'    </v-card>',
'  </v-dialog>',
'</div>',
'</template>',
'',
'<script>',
'export default {',
'  data() {',
'    return {',
'      allDevices: [],',
'      renameDialog: false,',
'      renameName: "",',
'      renameOld: "",',
'      renameIndex: null',
'    }',
'  },',
'  computed: {',
'    devices() {',
'      return this.allDevices.filter(function(d) { return d && d.site === this.site; }.bind(this));',
'    },',
'    site() {',
'      return this.msg?.site || "Agriplus";',
'    }',
'  },',
'  watch: {',
'    msg(v) {',
'      if (v && v.payload && Array.isArray(v.payload)) {',
'        this.allDevices = v.payload;',
'      }',
'    }',
'  },',
'  methods: {',
'    borderColor(d) { return d.running?"#2563eb":d.ready?"#16a34a":d.fault?"#dc2626":d.online?"#f59e0b":"#e5e7eb"; },',
'    chipColor(d) { return d.running?"blue":d.ready?"green":d.fault?"red":d.online?"orange":"grey"; },',
'    chipIcon(d) { return d.running?"mdi-play-circle":d.ready?"mdi-check-circle":d.fault?"mdi-alert-circle":d.online?"mdi-pause-circle":"mdi-power-plug-off"; },',
'    chipText(d) { return d.running?"EN MARCHA":d.ready?"LISTO":d.fault?"FALLA":d.online?"PARADO":"OFFLINE"; },',
'    fmt(v) { return v != null && v.toFixed ? v.toFixed(2) : "0"; },',
'    fmtT(v) { return v != null && v.toFixed ? v.toFixed(1) : "0"; },',
'    openRename(d) {',
'      this.renameOld = d.displayName || d.name;',
'      this.renameName = d.displayName || d.name;',
'      this.renameIndex = d.index;',
'      this.renameDialog = true;',
'    },',
'    saveRename() {',
'      if (!this.renameName.trim()) return;',
'      this.send({topic: "rename", payload: {index: this.renameIndex, newName: this.renameName.trim()}});',
'      // Update locally immediately',
'      var dev = this.allDevices[this.renameIndex];',
'      if (dev) dev.displayName = this.renameName.trim();',
'      this.renameDialog = false;',
'    },',
'    gaugesFor(d) {',
'      var half = 113.097;',
'      var isCFW = d.type !== "SSW900";',
'      var defs = {',
'        velocidad: {min:0,max:1800,green:1200,yellow:1500},',
'        corriente: {min:0,max:150,green:80,yellow:120},',
'        tension: {min:0,max:500,green:380,yellow:480},',
'        frecuencia: {min:0,max:70,green:50,yellow:62}',
'      };',
'      function mk(key, val, label, unit) {',
'        var c = defs[key];',
'        var range = c.max - c.min; if(range<=0) range=1;',
'        var gPct = (c.green - c.min) / range;',
'        var yPct = (c.yellow - c.min) / range;',
'        var vPct = Math.max(0, Math.min((val - c.min) / range, 1));',
'        var color = val<=c.green ? "#22c55e" : val<=c.yellow ? "#f59e0b" : "#ef4444";',
'        return {',
'          z1len: gPct*half, z2len:(yPct-gPct)*half, z3len:(1-yPct)*half,',
'          fillLen: vPct*half,',
'          c1:"#22c55e", c2:"#f59e0b", c3:"#ef4444",',
'          arcColor: color,',
'          label: label,',
'          value: typeof val==="number"&&val%1!==0 ? val.toFixed(1) : val,',
'          unit: unit',
'        };',
'      }',
'      var g = [];',
'      if (isCFW) {',
'        g.push(mk("velocidad", d.motorSpeed||0, "Velocidad", "RPM"));',
'      }',
'      g.push(mk("corriente", d.current||0, "Corriente", "A"));',
'      g.push(mk("tension", d.outputVoltage||0, "Tension", "V"));',
'      if (isCFW) {',
'        g.push(mk("frecuencia", d.frequency||0, "Frecuencia", "Hz"));',
'      }',
'      return g;',
'    }',
'  }',
'}',
'</script>'
].join('\n');

// Apply to both site templates and wire outputs to rename handler
['weg_dash_agri_cards', 'weg_dash_agro_cards'].forEach(function(id) {
    var node = f.find(function(n) { return n.id === id; });
    if (node) {
        node.format = cardTemplate;
        node.wires = [['weg_rename_handler']];
        console.log('Updated card template + wired rename: ' + id);
    }
});

// ============================================================
// 6. Clean up old SSW900 static cards if they still exist
// ============================================================
var oldSSW = ['weg_d2_ssw_card_1', 'weg_d2_ssw_card_2', 'weg_d2_g_ssw'];
f = f.filter(function(n) {
    if (oldSSW.indexOf(n.id) >= 0) {
        console.log('Removed old static node: ' + n.id);
        return false;
    }
    return true;
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\nDone.');
console.log('Nodes:', f.length);
