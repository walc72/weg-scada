var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// REMOVE ALL OLD D2 WIDGETS (gauges, texts) — keep config nodes
// ============================================================
var keepIds = ['weg_d2_tab','weg_d2_base','weg_d2_theme',
    'weg_d2_pg_agri','weg_d2_pg_agro','weg_d2_pg_trend',
    'weg_d2_g_banner','weg_d2_g_cfw1','weg_d2_g_cfw2','weg_d2_g_cfw3','weg_d2_g_cfw4',
    'weg_d2_g_ssw','weg_d2_g_agro',
    'weg_d2_splitter','weg_d2_tick','weg_d2_parser_cfw1',
    'weg_mb_cfg','weg_mb_read1'];

for (var i = f.length - 1; i >= 0; i--) {
    var n = f[i];
    if (n.z === 'weg_d2_tab' && !keepIds.includes(n.id)) {
        f.splice(i, 1);
    }
}
console.log('Cleaned old widgets');

// ============================================================
// VUETIFY CARD TEMPLATE (Vue 3 SFC for Dashboard 2.0)
// ============================================================
var cardTemplate = `<template>
<v-card v-if="msg?.payload" :style="{borderLeft: '4px solid ' + (d.running ? '#2563eb' : d.ready ? '#16a34a' : d.fault ? '#dc2626' : d.online ? '#f59e0b' : '#e5e7eb')}" elevation="2" rounded="lg" class="pa-0">

  <!-- STATUS HEADER -->
  <v-card-item class="pb-1">
    <template v-slot:title>
      <span style="font-weight:700;font-size:1.1em">{{ d.name }}</span>
      <span style="color:#999;font-size:0.75em;margin-left:8px;font-family:monospace">{{ d.ip }}</span>
    </template>
    <template v-slot:append>
      <v-chip :color="d.running?'blue':d.ready?'green':d.fault?'red':d.online?'orange':'grey'"
              variant="elevated" size="default" label
              style="font-weight:800;font-size:0.9em;letter-spacing:0.5px">
        <v-icon start :icon="d.running?'mdi-play-circle':d.ready?'mdi-check-circle':d.fault?'mdi-alert-circle':d.online?'mdi-pause-circle':'mdi-power-plug-off'"></v-icon>
        {{ d.running?'EN MARCHA':d.ready?'LISTO':d.fault?'FALLA':d.online?'PARADO':'OFFLINE' }}
      </v-chip>
    </template>
  </v-card-item>

  <v-divider></v-divider>

  <!-- GAUGES ROW -->
  <div v-if="d.online" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:12px 8px 4px;text-align:center">
    <div v-for="g in gauges" :key="g.label">
      <div style="font-size:0.7em;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">{{g.label}}</div>
      <svg viewBox="0 0 100 56" :width="110" :height="62">
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e5e7eb" stroke-width="6" stroke-linecap="round"/>
        <path :d="arcPath(g.pct)" fill="none" :stroke="g.color" stroke-width="6" stroke-linecap="round"/>
        <text x="50" y="42" text-anchor="middle" fill="#1a1a2e" font-size="16" font-weight="700" font-family="monospace">{{g.value}}</text>
        <text x="50" y="53" text-anchor="middle" fill="#999" font-size="8" font-family="monospace">{{g.unit}}</text>
      </svg>
    </div>
  </div>

  <!-- OFFLINE PLACEHOLDER -->
  <div v-else style="padding:24px;text-align:center;color:#bbb">
    <v-icon size="36" color="grey-lighten-1">mdi-power-plug-off</v-icon>
    <div style="margin-top:4px;font-size:0.9em">Drive sin conexion</div>
  </div>

  <!-- METRICS ROW -->
  <div v-if="d.online" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:4px 12px 8px">
    <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border-left:3px solid #f59e0b">
      <div style="font-size:0.65em;color:#999;font-weight:600;text-transform:uppercase">Potencia</div>
      <div style="font-size:1.3em;font-weight:700;font-family:monospace">{{d.power.toFixed(2)}} <span style="font-size:0.6em;color:#999">kW</span></div>
    </div>
    <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border-left:3px solid #8b5cf6">
      <div style="font-size:0.65em;color:#999;font-weight:600;text-transform:uppercase">Cos phi</div>
      <div style="font-size:1.3em;font-weight:700;font-family:monospace">{{d.cosPhi.toFixed(2)}}</div>
    </div>
    <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border-left:3px solid" :style="{borderLeftColor: d.motorTemp>100?'#ef4444':d.motorTemp>60?'#f59e0b':'#22c55e'}">
      <div style="font-size:0.65em;color:#999;font-weight:600;text-transform:uppercase">Temp. Motor</div>
      <div style="font-size:1.3em;font-weight:700;font-family:monospace" :style="{color: d.motorTemp>100?'#ef4444':d.motorTemp>60?'#f59e0b':'#22c55e'}">{{d.motorTemp.toFixed(1)}} <span style="font-size:0.6em;color:#999">°C</span></div>
    </div>
  </div>

  <!-- FAULT ALERT -->
  <v-alert v-if="d.hasFault" type="error" density="compact" variant="tonal" class="mx-3 mb-2" style="font-family:monospace;font-size:0.85em">
    <strong>FALLA:</strong> {{ d.faultText }}
  </v-alert>
  <v-alert v-if="d.hasAlarm && !d.hasFault" type="warning" density="compact" variant="tonal" class="mx-3 mb-2" style="font-family:monospace;font-size:0.85em">
    Alarma: {{ d.alarmText }}
  </v-alert>

  <!-- FOOTER -->
  <v-card-actions v-if="d.online" style="padding:4px 12px 8px;justify-content:space-between">
    <span style="font-size:0.7em;color:#bbb;font-family:monospace">
      <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>{{d.hoursEnergized}}h encendido | {{d.hoursEnabled}}h habilitado
    </span>
    <v-chip :color="d.hasFault?'red':'green'" variant="tonal" size="x-small" label>
      {{ d.hasFault ? d.faultText : 'Sin Falla' }}
    </v-chip>
  </v-card-actions>

</v-card>
</template>

<script>
export default {
  computed: {
    d() {
      return this.msg?.payload || {name:'',ip:'',online:false,running:false,ready:false,fault:false,hasFault:false,hasAlarm:false,current:0,frequency:0,outputVoltage:0,motorSpeed:0,power:0,cosPhi:0,motorTemp:0,speedRef:1800,nominalCurrent:150,nominalVoltage:500,nominalFreq:70,faultText:'',alarmText:'',hoursEnergized:'-',hoursEnabled:'-'};
    },
    gauges() {
      var d = this.d;
      return [
        {label:'Velocidad', value:d.motorSpeed, unit:'RPM', pct:d.speedRef>0?Math.min(d.motorSpeed/d.speedRef*100,100):0, color:'#3b82f6'},
        {label:'Corriente', value:d.current?.toFixed(1)||'0', unit:'A', pct:d.nominalCurrent>0?Math.min(d.current/d.nominalCurrent*100,100):0, color:'#06b6d4'},
        {label:'Tension', value:d.outputVoltage, unit:'V', pct:d.nominalVoltage>0?Math.min(d.outputVoltage/d.nominalVoltage*100,100):0, color:'#f59e0b'},
        {label:'Frecuencia', value:d.frequency?.toFixed(1)||'0', unit:'Hz', pct:d.nominalFreq>0?Math.min(d.frequency/d.nominalFreq*100,100):0, color:'#22c55e'}
      ];
    }
  },
  methods: {
    arcPath(pct) {
      var p = Math.max(0, Math.min(pct/100, 1));
      if (p === 0) return 'M 10 50 A 40 40 0 0 1 10.1 50';
      var angle = Math.PI * p;
      var x = 10 + 80 * p;
      var y = 50 - 40 * Math.sin(angle);
      var large = p > 0.5 ? 1 : 0;
      return 'M 10 50 A 40 40 0 ' + large + ' 1 ' + x.toFixed(1) + ' ' + y.toFixed(1);
    }
  }
}
</script>`;

// ============================================================
// CREATE CARD TEMPLATES FOR EACH DRIVE
// ============================================================
for (var driveNum = 1; driveNum <= 4; driveNum++) {
    f.push({
        id: 'weg_d2_card_' + driveNum,
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_cfw' + driveNum,
        name: 'CFW900 #' + driveNum + ' Card',
        order: 1,
        width: '6',
        height: '5',
        format: cardTemplate,
        storeOutMessages: true,
        fwdInMessages: true,
        resendOnRefresh: true,
        templateScope: 'local',
        x: 700,
        y: 80 + (driveNum - 1) * 40,
        wires: [[]]
    });
}
console.log('Created 4 Vuetify card templates');

// ============================================================
// BANNER as ui-template with v-alert
// ============================================================
f.push({
    id: 'weg_d2_banner_new',
    type: 'ui-template',
    z: 'weg_d2_tab',
    group: 'weg_d2_g_banner',
    name: 'Status Banner',
    order: 1,
    width: '12',
    height: '1',
    format: `<template>
<v-alert v-if="msg?.payload"
  :type="msg.payload.type || 'info'"
  :icon="msg.payload.icon || 'mdi-information'"
  variant="tonal"
  density="comfortable"
  prominent
  style="font-family:monospace;font-weight:700;font-size:1.05em;letter-spacing:0.5px">
  {{ msg.payload.text || msg.payload }}
</v-alert>
</template>`,
    storeOutMessages: true,
    fwdInMessages: true,
    resendOnRefresh: true,
    templateScope: 'local',
    x: 700,
    y: 40,
    wires: [[]]
});
console.log('Created Vuetify banner');

// ============================================================
// SSW PLACEHOLDERS
// ============================================================
for (var si = 1; si <= 2; si++) {
    f.push({
        id: 'weg_d2_ssw_card_' + si,
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_ssw',
        name: 'SSW900 #' + si,
        order: si,
        width: '6',
        height: '2',
        format: '<template><v-card variant="outlined" rounded="lg" class="pa-4 text-center" style="opacity:0.5">' +
            '<v-icon size="32" color="grey">mdi-engine-off</v-icon>' +
            '<div style="font-weight:700;font-size:1em;margin-top:4px">SSW900 #' + si + '</div>' +
            '<v-chip color="grey" variant="tonal" size="small" class="mt-2" label>Modbus RTU — Pendiente TCP</v-chip>' +
            '</v-card></template>',
        storeOutMessages: false, fwdInMessages: false, resendOnRefresh: true, templateScope: 'local',
        x: 700, y: 260 + si * 30, wires: [[]]
    });
}

// Agrocaraya SSW#3
f.push({
    id: 'weg_d2_ssw_card_3',
    type: 'ui-template',
    z: 'weg_d2_tab',
    group: 'weg_d2_g_agro',
    name: 'SSW900 #3 Agrocaraya',
    order: 1, width: '6', height: '2',
    format: '<template><v-card variant="outlined" rounded="lg" class="pa-4 text-center" style="opacity:0.5">' +
        '<v-icon size="32" color="grey">mdi-engine-off</v-icon>' +
        '<div style="font-weight:700;font-size:1em;margin-top:4px">SSW900 #3</div>' +
        '<v-chip color="grey" variant="tonal" size="small" class="mt-2" label>Modbus RTU — Pendiente TCP</v-chip>' +
        '</v-card></template>',
    storeOutMessages: false, fwdInMessages: false, resendOnRefresh: true, templateScope: 'local',
    x: 700, y: 340, wires: [[]]
});
console.log('Created SSW placeholders');

// ============================================================
// REWRITE SPLITTER: Send full drive objects to cards
// ============================================================
var splitter = f.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter) {
    splitter.func = `
var devices = global.get('cfwDevices') || [null,null,null,null];
var outputs = [];

// One output per drive card (4 outputs)
for (var i = 0; i < 4; i++) {
    var d = devices[i];
    if (d && d.online === true) {
        outputs.push({payload: d});
    } else {
        outputs.push({payload: {
            name: 'CFW900 #' + (i+1),
            ip: ['192.168.10.100','192.168.10.101','192.168.10.102','192.168.10.103'][i],
            online: false, running: false, ready: false, fault: false,
            hasFault: false, hasAlarm: false,
            current: 0, frequency: 0, outputVoltage: 0, motorSpeed: 0,
            power: 0, cosPhi: 0, motorTemp: 0,
            speedRef: 1800, nominalCurrent: 150, nominalVoltage: 500, nominalFreq: 70,
            faultText: '', alarmText: '',
            hoursEnergized: '-', hoursEnabled: '-'
        }});
    }
}

// Banner (output 5)
var onlineCount = 0, runningCount = 0, faultTexts = [];
for (var j = 0; j < 4; j++) {
    var dev = devices[j];
    if (dev && dev.online === true) {
        onlineCount++;
        if (dev.running) runningCount++;
        if (dev.hasFault) faultTexts.push(dev.name + ': ' + dev.faultText);
    }
}

var banner;
if (faultTexts.length > 0) {
    banner = {text: faultTexts.join(' | '), type: 'error', icon: 'mdi-alert'};
} else if (runningCount > 0) {
    banner = {text: runningCount + '/' + onlineCount + ' DRIVES EN MARCHA', type: 'info', icon: 'mdi-engine'};
} else if (onlineCount > 0) {
    banner = {text: onlineCount + '/4 DRIVES ONLINE — ESTACION OPERATIVA', type: 'success', icon: 'mdi-check-circle'};
} else {
    banner = {text: 'CONECTANDO...', type: 'warning', icon: 'mdi-loading'};
}
outputs.push({payload: banner});

return outputs;
`;
    splitter.outputs = 5;
    splitter.wires = [
        ['weg_d2_card_1'],
        ['weg_d2_card_2'],
        ['weg_d2_card_3'],
        ['weg_d2_card_4'],
        ['weg_d2_banner_new']
    ];
    console.log('Rewired splitter: 5 outputs -> 4 cards + banner');
}

// ============================================================
// Update group sizes
// ============================================================
for (var g = 1; g <= 4; g++) {
    var grp = f.find(function(n) { return n.id === 'weg_d2_g_cfw' + g; });
    if (grp) { grp.width = '6'; grp.height = '6'; }
}
var bannerGrp = f.find(function(n) { return n.id === 'weg_d2_g_banner'; });
if (bannerGrp) { bannerGrp.name = 'Estación de Bombeo'; bannerGrp.width = '12'; bannerGrp.height = '1'; }

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('COMPLETE - Vuetify dashboard rebuilt');
