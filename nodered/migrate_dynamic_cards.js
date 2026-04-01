var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. Remove old static cards, splitter, and per-drive groups
// ============================================================
var removeIds = [
    'weg_d2_card_1', 'weg_d2_card_2', 'weg_d2_card_3', 'weg_d2_card_4',
    'weg_d2_g_cfw1', 'weg_d2_g_cfw2', 'weg_d2_g_cfw3', 'weg_d2_g_cfw4',
    'weg_d2_g_ssw',
    'weg_d2_splitter', 'weg_d2_inject'
];
f = f.filter(function(n) {
    if (removeIds.indexOf(n.id) >= 0) {
        console.log('Removing: ' + n.id + ' (' + (n.name || n.type) + ')');
        return false;
    }
    return true;
});

// ============================================================
// 2. Create groups for dynamic card containers
// ============================================================
// Agriplus drives group
if (!f.find(function(n){return n.id==='weg_d2_g_agri_drives';})) {
    f.push({
        id: 'weg_d2_g_agri_drives',
        type: 'ui-group',
        name: 'Drives Agriplus',
        page: 'weg_d2_pg_agri',
        width: '24',
        height: '1',
        order: 2,
        showTitle: false,
        className: '',
        visible: 'true',
        disabled: 'false'
    });
    console.log('Added group: Drives Agriplus');
}

// Agrocaraya drives group
if (!f.find(function(n){return n.id==='weg_d2_g_agro_drives';})) {
    f.push({
        id: 'weg_d2_g_agro_drives',
        type: 'ui-group',
        name: 'Drives Agrocaraya',
        page: 'weg_d2_pg_agro',
        width: '24',
        height: '1',
        order: 1,
        showTitle: false,
        className: '',
        visible: 'true',
        disabled: 'false'
    });
    console.log('Added group: Drives Agrocaraya');
}

// ============================================================
// 3. Create the dynamic card template (shared between sites)
//    This is the Vuetify template with card + gauge logic
// ============================================================
var cardTemplate = [
'<template>',
'<div>',
'  <div v-if="!devices.length" style="padding:24px;text-align:center;color:#999">',
'    <v-icon size="48" color="grey">mdi-database-off</v-icon>',
'    <div style="margin-top:8px">No hay dispositivos para este sitio</div>',
'  </div>',
'  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;padding:8px">',
'    <v-card v-for="d in devices" :key="d.name" :style="{borderLeft:\'4px solid \' + borderColor(d)}" elevation="2" rounded="lg" class="pa-0">',
'',
'      <!-- STATUS HEADER -->',
'      <v-card-item class="pb-1">',
'        <template v-slot:title>',
'          <span style="font-weight:700;font-size:1.1em">{{ d.name }}</span>',
'          <v-chip size="x-small" variant="tonal" :color="d.type===\'SSW900\'?\'purple\':\'blue\'" class="ml-2">{{d.type}}</v-chip>',
'          <span style="color:#999;font-size:0.7em;margin-left:6px;font-family:monospace">{{ d.ip }}</span>',
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
'</div>',
'</template>',
'',
'<script>',
'export default {',
'  data() {',
'    return { allDevices: [] }',
'  },',
'  computed: {',
'    devices() {',
'      return this.allDevices.filter(function(d) { return d && d.site === this.site; }.bind(this));',
'    },',
'    site() {',
'      // Determined by which group this template is in - passed via msg',
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

// ============================================================
// 4. Create inject + function to feed devices to the templates
// ============================================================

// Inject every 2s
if (!f.find(function(n){return n.id==='weg_dash_inject';})) {
    f.push({
        id: 'weg_dash_inject',
        type: 'inject',
        z: 'weg_d2_tab',
        name: 'Dashboard 2s',
        repeat: '2',
        once: true,
        onceDelay: '3',
        topic: '',
        props: [],
        x: 100,
        y: 300,
        wires: [['weg_dash_splitter']]
    });
    console.log('Added dashboard inject');
}

// Splitter: reads cfwDevices and sends to both site templates + banner
if (!f.find(function(n){return n.id==='weg_dash_splitter';})) {
    f.push({
        id: 'weg_dash_splitter',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Site Splitter',
        func: [
            'var devices = global.get("cfwDevices") || [];',
            'var total = devices.length;',
            '',
            '// Count stats for banner',
            'var onlineCount = 0, runningCount = 0, faultTexts = [];',
            'for (var i = 0; i < devices.length; i++) {',
            '    var dev = devices[i];',
            '    if (dev && dev.online) {',
            '        onlineCount++;',
            '        if (dev.running) runningCount++;',
            '        if (dev.hasFault) faultTexts.push(dev.name + ": " + dev.faultText);',
            '    }',
            '}',
            'var offlineCount = total - onlineCount;',
            '',
            'var alertColor, icon, text;',
            'if (faultTexts.length > 0) {',
            '    alertColor = "#ef4444"; icon = "mdi-alert"; text = faultTexts.join(" | ");',
            '} else if (runningCount > 0) {',
            '    alertColor = "#3b82f6"; icon = "mdi-engine"; text = runningCount + "/" + onlineCount + " DRIVES EN MARCHA";',
            '} else if (onlineCount > 0) {',
            '    alertColor = "#22c55e"; icon = "mdi-check-circle"; text = onlineCount + "/" + total + " DRIVES ONLINE";',
            '} else {',
            '    alertColor = "#f59e0b"; icon = "mdi-loading"; text = "CONECTANDO...";',
            '}',
            '',
            'var banner = {payload: {text: text, alertColor: alertColor, icon: icon, running: runningCount, online: onlineCount, faults: faultTexts.length, offline: offlineCount}};',
            '',
            '// Output 1: Agriplus devices array',
            'var agri = {payload: devices, site: "Agriplus"};',
            '// Output 2: Agrocaraya devices array',
            'var agro = {payload: devices, site: "Agrocaraya"};',
            '// Output 3: Banner',
            '// Output 4: Nav stats',
            'return [agri, agro, banner, banner];'
        ].join('\n'),
        outputs: 4,
        x: 300,
        y: 300,
        wires: [['weg_dash_agri_cards'], ['weg_dash_agro_cards'], ['weg_d2_banner'], ['weg_d2_navstats']]
    });
    console.log('Added site splitter');
}

// ============================================================
// 5. Add the dynamic card templates for each site
// ============================================================

// Agriplus cards
if (!f.find(function(n){return n.id==='weg_dash_agri_cards';})) {
    f.push({
        id: 'weg_dash_agri_cards',
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_agri_drives',
        name: 'Agriplus Drive Cards',
        page: '',
        ui: '',
        templateScope: 'local',
        order: 1,
        width: '24',
        height: '1',
        head: '',
        format: cardTemplate,
        storeOutMessages: true,
        passthru: false,
        resendOnRefresh: true,
        className: '',
        x: 520,
        y: 280,
        wires: [[]]
    });
    console.log('Added Agriplus dynamic cards template');
}

// Agrocaraya cards
if (!f.find(function(n){return n.id==='weg_dash_agro_cards';})) {
    f.push({
        id: 'weg_dash_agro_cards',
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_agro_drives',
        name: 'Agrocaraya Drive Cards',
        page: '',
        ui: '',
        templateScope: 'local',
        order: 1,
        width: '24',
        height: '1',
        head: '',
        format: cardTemplate,
        storeOutMessages: true,
        passthru: false,
        resendOnRefresh: true,
        className: '',
        x: 520,
        y: 320,
        wires: [[]]
    });
    console.log('Added Agrocaraya dynamic cards template');
}

// ============================================================
// 6. Clean up old group for Agrocaraya
// ============================================================
var oldAgro = f.find(function(n){return n.id==='weg_d2_g_agro';});
if (oldAgro) {
    // Keep it but update name
    oldAgro.name = 'Banner Agrocaraya';
    oldAgro.order = 0;
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\n=== Done ===');
console.log('Total nodes:', f.length);
console.log('');
console.log('New flow:');
console.log('  Inject 2s → Site Splitter → [Agriplus Cards, Agrocaraya Cards, Banner, NavStats]');
console.log('  MQTT → Bridge → cfwDevices (global) → Splitter reads it');
console.log('  Cards auto-filter by site property');
