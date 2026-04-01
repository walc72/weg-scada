var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. REPORTS PAGE + GROUP
// ============================================================
if (!f.find(function(n){return n.id==='weg_d2_pg_reports'})) {
    f.push({id:'weg_d2_pg_reports',type:'ui-page',name:'Reportes',ui:'weg_d2_base',path:'/reports',icon:'mdi-file-chart',layout:'grid',theme:'weg_d2_theme',order:5});
    console.log('Created Reportes page');
}
if (!f.find(function(n){return n.id==='weg_d2_g_reports'})) {
    f.push({id:'weg_d2_g_reports',type:'ui-group',name:'Generador de Reportes',page:'weg_d2_pg_reports',width:'12',height:'1',order:1});
    console.log('Created Reportes group');
}

// ============================================================
// 2. REPORT FORM TEMPLATE (Vuetify)
// ============================================================
var formTemplate = [
'<template>',
'<div style="font-family:Inter,system-ui,sans-serif">',
'  <!-- REPORT GENERATOR -->',
'  <v-card variant="flat" style="background:transparent">',
'    <v-card-title class="px-0" style="font-size:1.3em;font-weight:700;color:#1e293b">',
'      <v-icon color="#16a34a" class="mr-2">mdi-file-chart</v-icon> Generador de Reportes',
'    </v-card-title>',
'',
'    <!-- FILTERS -->',
'    <v-card variant="outlined" rounded="lg" class="mb-4">',
'      <v-card-text>',
'        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start">',
'          <v-select v-model="period" :items="periods" item-title="text" item-value="value"',
'            label="Periodo" variant="outlined" density="compact" hide-details></v-select>',
'          <div v-if="period===\'custom\'" style="display:flex;gap:8px">',
'            <v-text-field v-model="customStart" label="Desde" type="date" variant="outlined" density="compact" hide-details></v-text-field>',
'            <v-text-field v-model="customEnd" label="Hasta" type="date" variant="outlined" density="compact" hide-details></v-text-field>',
'          </div>',
'          <v-select v-model="selectedSites" :items="allSites" label="Sitios" variant="outlined"',
'            density="compact" hide-details multiple chips closable-chips></v-select>',
'          <v-select v-model="selectedDrives" :items="availableDrives" label="Dispositivos" variant="outlined"',
'            density="compact" hide-details multiple chips closable-chips></v-select>',
'        </div>',
'        <div class="mt-3">',
'          <v-btn color="#16a34a" @click="generateReport" :loading="loading" prepend-icon="mdi-play">',
'            Generar Reporte',
'          </v-btn>',
'        </div>',
'      </v-card-text>',
'    </v-card>',
'',
'    <!-- REPORT TABLE -->',
'    <v-card v-if="reportData.length" variant="outlined" rounded="lg" class="mb-4">',
'      <v-card-title style="font-size:1em;font-weight:700;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb">',
'        Resultado: {{ periodLabel }} <span style="color:#999;font-size:0.8em;margin-left:8px">{{ reportData.length }} dispositivos</span>',
'      </v-card-title>',
'      <div style="overflow-x:auto">',
'        <table style="width:100%;border-collapse:collapse;font-size:0.85em">',
'          <thead>',
'            <tr style="background:#f1f5f9;text-align:left">',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0">Dispositivo</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0">Sitio</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Corriente Prom (A)</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Corriente Max (A)</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Tension Prom (V)</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Frecuencia Prom (Hz)</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Potencia Prom (kW)</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Potencia Max (kW)</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Temp Max (&deg;C)</th>',
'              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">% Encendido</th>',
'            </tr>',
'          </thead>',
'          <tbody>',
'            <tr v-for="(r,i) in reportData" :key="i" :style="{background: i%2===0?\'#fff\':\'#f9fafb\'}">',
'              <td style="padding:8px 12px;font-weight:600">{{ r.name }}</td>',
'              <td style="padding:8px 12px;color:#666">{{ r.site }}</td>',
'              <td style="padding:8px 12px;text-align:right">{{ r.currentMean }}</td>',
'              <td style="padding:8px 12px;text-align:right;color:#ef4444">{{ r.currentMax }}</td>',
'              <td style="padding:8px 12px;text-align:right">{{ r.voltageMean }}</td>',
'              <td style="padding:8px 12px;text-align:right">{{ r.frequencyMean }}</td>',
'              <td style="padding:8px 12px;text-align:right">{{ r.powerMean }}</td>',
'              <td style="padding:8px 12px;text-align:right;color:#ef4444">{{ r.powerMax }}</td>',
'              <td style="padding:8px 12px;text-align:right" :style="{color: parseFloat(r.tempMax)>100?\'#ef4444\':parseFloat(r.tempMax)>60?\'#f59e0b\':\'#22c55e\'}">{{ r.tempMax }}</td>',
'              <td style="padding:8px 12px;text-align:right">{{ r.runPct }}</td>',
'            </tr>',
'          </tbody>',
'        </table>',
'      </div>',
'      <v-card-actions style="padding:12px 16px;border-top:1px solid #e5e7eb">',
'        <v-btn variant="outlined" prepend-icon="mdi-download" @click="exportCSV">Exportar CSV</v-btn>',
'        <v-btn variant="outlined" prepend-icon="mdi-printer" @click="printReport">Imprimir</v-btn>',
'      </v-card-actions>',
'    </v-card>',
'',
'    <!-- NO DATA MESSAGE -->',
'    <v-alert v-if="noData" type="warning" variant="tonal" density="compact" class="mb-4">',
'      No se encontraron datos para el periodo seleccionado.',
'    </v-alert>',
'',
'    <!-- EMAIL SECTION -->',
'    <v-card variant="outlined" rounded="lg">',
'      <v-card-title style="font-size:1em;font-weight:700;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb">',
'        <v-icon class="mr-1" size="small">mdi-email-outline</v-icon> Envio por Correo y Programacion',
'      </v-card-title>',
'      <v-card-text style="padding:16px">',
'        <!-- Auth check -->',
'        <div v-if="!emailAuth">',
'          <div style="display:flex;gap:12px;align-items:end">',
'            <v-text-field v-model="emailPw" label="Contrasena de admin" type="password" variant="outlined"',
'              density="compact" hide-details style="max-width:300px" @keyup.enter="authEmail"></v-text-field>',
'            <v-btn color="primary" @click="authEmail" :loading="authLoading">Desbloquear</v-btn>',
'          </div>',
'          <div v-if="authError" style="color:#ef4444;font-size:0.85em;margin-top:4px">{{ authError }}</div>',
'        </div>',
'',
'        <div v-if="emailAuth">',
'          <!-- SMTP Config -->',
'          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">',
'            <v-text-field v-model="smtp.user" label="Email Gmail (remitente)" variant="outlined"',
'              density="compact" hide-details placeholder="tu-email@gmail.com"></v-text-field>',
'            <v-text-field v-model="smtp.pass" label="App Password Gmail" type="password" variant="outlined"',
'              density="compact" hide-details placeholder="xxxx xxxx xxxx xxxx"></v-text-field>',
'          </div>',
'',
'          <!-- Recipients -->',
'          <v-combobox v-model="recipients" label="Destinatarios" variant="outlined" density="compact"',
'            hide-details multiple chips closable-chips class="mb-4"',
'            hint="Presione Enter para agregar" persistent-hint></v-combobox>',
'',
'          <!-- Schedule -->',
'          <div style="display:flex;gap:12px;align-items:end;margin-bottom:16px">',
'            <v-select v-model="schedule" :items="scheduleOpts" item-title="text" item-value="value"',
'              label="Programacion automatica" variant="outlined" density="compact" hide-details',
'              style="max-width:300px"></v-select>',
'            <v-select v-if="schedule===\'weekly\'" v-model="scheduleDay" :items="weekDays" item-title="text" item-value="value"',
'              label="Dia" variant="outlined" density="compact" hide-details style="max-width:200px"></v-select>',
'            <v-text-field v-model="scheduleHour" label="Hora" type="number" min="0" max="23"',
'              variant="outlined" density="compact" hide-details style="max-width:100px"></v-text-field>',
'          </div>',
'',
'          <!-- Actions -->',
'          <div style="display:flex;gap:12px">',
'            <v-btn color="#16a34a" @click="saveEmailConfig" prepend-icon="mdi-content-save">Guardar Programacion</v-btn>',
'            <v-btn color="#2563eb" @click="sendNow" :loading="sending" :disabled="!reportData.length || !recipients.length"',
'              prepend-icon="mdi-send">Enviar Ahora</v-btn>',
'          </div>',
'        </div>',
'      </v-card-text>',
'    </v-card>',
'',
'    <v-snackbar v-model="snack" :color="snackColor" timeout="3000">{{ snackMsg }}</v-snackbar>',
'  </v-card>',
'</div>',
'</template>',
'',
'<script>',
'export default {',
'  data() {',
'    return {',
'      period: "week",',
'      periods: [',
'        {text:"Hoy",value:"today"},',
'        {text:"Ultima semana",value:"week"},',
'        {text:"Ultimo mes",value:"month"},',
'        {text:"Personalizado",value:"custom"}',
'      ],',
'      customStart: "",',
'      customEnd: "",',
'      allSites: ["Agriplus","Agrocaraya"],',
'      selectedSites: ["Agriplus","Agrocaraya"],',
'      allDrives: ["SAER 1","SAER 2","SAER 3","SAER 4","SAER 5","SAER 8","SSW900 Agrocaraya"],',
'      selectedDrives: [],',
'      loading: false,',
'      reportData: [],',
'      noData: false,',
'      // Email',
'      emailAuth: false,',
'      emailPw: "",',
'      authLoading: false,',
'      authError: "",',
'      smtp: {user:"", pass:""},',
'      recipients: [],',
'      schedule: "none",',
'      scheduleOpts: [',
'        {text:"Ninguna",value:"none"},',
'        {text:"Diario",value:"daily"},',
'        {text:"Semanal",value:"weekly"},',
'        {text:"Mensual",value:"monthly"}',
'      ],',
'      scheduleDay: 1,',
'      weekDays: [',
'        {text:"Lunes",value:1},{text:"Martes",value:2},{text:"Miercoles",value:3},',
'        {text:"Jueves",value:4},{text:"Viernes",value:5},{text:"Sabado",value:6},{text:"Domingo",value:0}',
'      ],',
'      scheduleHour: 8,',
'      sending: false,',
'      snack: false,',
'      snackMsg: "",',
'      snackColor: "success"',
'    }',
'  },',
'  computed: {',
'    availableDrives() {',
'      return this.allDrives;',
'    },',
'    periodLabel() {',
'      var p = this.periods.find(function(x){return x.value===this.period}.bind(this));',
'      return p ? p.text : this.period;',
'    },',
'    dateRange() {',
'      var now = new Date();',
'      var start, stop;',
'      if (this.period === "today") {',
'        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());',
'        stop = now;',
'      } else if (this.period === "week") {',
'        start = new Date(now.getTime() - 7*24*60*60*1000);',
'        stop = now;',
'      } else if (this.period === "month") {',
'        start = new Date(now.getTime() - 30*24*60*60*1000);',
'        stop = now;',
'      } else {',
'        start = this.customStart ? new Date(this.customStart) : new Date(now.getTime() - 7*24*60*60*1000);',
'        stop = this.customEnd ? new Date(this.customEnd+"T23:59:59") : now;',
'      }',
'      return {start: start.toISOString(), stop: stop.toISOString()};',
'    }',
'  },',
'  mounted() {',
'    this.selectedDrives = this.allDrives.slice();',
'    this.send({topic:"loadConfig"});',
'  },',
'  watch: {',
'    msg(val) {',
'      if (!val) return;',
'      if (val.topic === "reportData") {',
'        this.loading = false;',
'        this.reportData = val.payload || [];',
'        this.noData = this.reportData.length === 0;',
'      }',
'      if (val.topic === "reportConfig") {',
'        var cfg = val.payload || {};',
'        if (cfg.smtp) this.smtp = cfg.smtp;',
'        if (cfg.recipients) this.recipients = cfg.recipients;',
'        if (cfg.schedule) this.schedule = cfg.schedule;',
'        if (cfg.scheduleDay !== undefined) this.scheduleDay = cfg.scheduleDay;',
'        if (cfg.scheduleHour !== undefined) this.scheduleHour = cfg.scheduleHour;',
'      }',
'      if (val.topic === "authResult") {',
'        this.authLoading = false;',
'        if (val.payload === true) { this.emailAuth = true; this.authError = ""; }',
'        else { this.authError = "Contrasena incorrecta"; }',
'      }',
'      if (val.topic === "emailSent") {',
'        this.sending = false;',
'        this.snackMsg = val.payload ? "Correo enviado exitosamente" : "Error al enviar correo";',
'        this.snackColor = val.payload ? "success" : "error";',
'        this.snack = true;',
'      }',
'      if (val.topic === "configSaved") {',
'        this.snackMsg = "Programacion guardada";',
'        this.snackColor = "success";',
'        this.snack = true;',
'      }',
'    }',
'  },',
'  methods: {',
'    generateReport() {',
'      this.loading = true;',
'      this.noData = false;',
'      this.reportData = [];',
'      var range = this.dateRange;',
'      this.send({topic:"generateReport", payload:{',
'        start: range.start, stop: range.stop,',
'        drives: this.selectedDrives, sites: this.selectedSites',
'      }});',
'    },',
'    authEmail() {',
'      this.authLoading = true;',
'      this.authError = "";',
'      this.send({topic:"authEmail", payload: this.emailPw});',
'    },',
'    saveEmailConfig() {',
'      this.send({topic:"saveSchedule", payload:{',
'        smtp: JSON.parse(JSON.stringify(this.smtp)),',
'        recipients: this.recipients.slice(),',
'        schedule: this.schedule,',
'        scheduleDay: this.scheduleDay,',
'        scheduleHour: this.scheduleHour',
'      }});',
'    },',
'    sendNow() {',
'      if (!this.reportData.length || !this.recipients.length) return;',
'      this.sending = true;',
'      this.send({topic:"sendEmail", payload:{',
'        data: this.reportData,',
'        recipients: this.recipients.slice(),',
'        smtp: JSON.parse(JSON.stringify(this.smtp)),',
'        period: this.periodLabel',
'      }});',
'    },',
'    exportCSV() {',
'      var hdr = "Dispositivo,Sitio,Corriente Prom (A),Corriente Max (A),Tension Prom (V),Frecuencia Prom (Hz),Potencia Prom (kW),Potencia Max (kW),Temp Max (C),% Encendido";',
'      var rows = this.reportData.map(function(r) {',
'        return [r.name,r.site,r.currentMean,r.currentMax,r.voltageMean,r.frequencyMean,r.powerMean,r.powerMax,r.tempMax,r.runPct].join(",");',
'      });',
'      var csv = hdr + "\\n" + rows.join("\\n");',
'      var blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});',
'      var url = URL.createObjectURL(blob);',
'      var a = document.createElement("a");',
'      var d = new Date();',
'      a.href = url;',
'      a.download = "reporte_weg_" + d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0") + ".csv";',
'      document.body.appendChild(a);',
'      a.click();',
'      document.body.removeChild(a);',
'      URL.revokeObjectURL(url);',
'    },',
'    printReport() {',
'      window.print();',
'    }',
'  }',
'}',
'</script>'
].join('\n');

var formId = 'weg_d2_report_form';
var existing = f.find(function(n){return n.id===formId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: formId, type: 'ui-template', z: 'weg_d2_tab',
    group: 'weg_d2_g_reports', name: 'Report Form',
    order: 1, width: '12', height: '1',
    format: formTemplate,
    storeOutMessages: true, fwdInMessages: true, resendOnRefresh: true,
    templateScope: 'local',
    x: 700, y: 600, wires: [['weg_d2_report_handler']]
});
console.log('Created report form template');

// ============================================================
// 3. REPORT HANDLER FUNCTION
// ============================================================
var handlerId = 'weg_d2_report_handler';
existing = f.find(function(n){return n.id===handlerId});
if (existing) { f.splice(f.indexOf(existing), 1); }

var handlerFunc = [
'var topic = msg.topic;',
'',
'// --- Load saved config ---',
'if (topic === "loadConfig") {',
'    var cfg = global.get("reportConfig") || {};',
'    return {topic: "reportConfig", payload: cfg};',
'}',
'',
'// --- Auth check (reuse adminPassword) ---',
'if (topic === "authEmail") {',
'    var storedPw = global.get("adminPassword") || "admin123";',
'    return {topic: "authResult", payload: msg.payload === storedPw};',
'}',
'',
'// --- Save schedule config ---',
'if (topic === "saveSchedule") {',
'    global.set("reportConfig", msg.payload);',
'    node.status({fill:"green",shape:"dot",text:"Schedule saved"});',
'    return {topic: "configSaved", payload: true};',
'}',
'',
'// --- Generate Report: build InfluxDB query and send via HTTP ---',
'if (topic === "generateReport") {',
'    var p = msg.payload;',
'    var driveFilter = "";',
'    if (p.drives && p.drives.length) {',
'        var nameFilters = p.drives.map(function(n) {',
'            return \'r.name == "\' + n + \'"\';',
'        }).join(" or ");',
'        driveFilter = "  |> filter(fn: (r) => " + nameFilters + ")\\n";',
'    }',
'    var siteFilter = "";',
'    if (p.sites && p.sites.length) {',
'        var siteFilters = p.sites.map(function(s) {',
'            return \'r.site == "\' + s + \'"\';',
'        }).join(" or ");',
'        siteFilter = "  |> filter(fn: (r) => " + siteFilters + ")\\n";',
'    }',
'    var fields = ["current","voltage","frequency","power","motor_temp","motor_speed","running"];',
'    var fieldFilter = fields.map(function(f){ return \'r._field == "\' + f + \'"\'; }).join(" or ");',
'',
'    var flux = "data = from(bucket: \\"weg_drives\\")\\n" +',
'        "  |> range(start: " + p.start + ", stop: " + p.stop + ")\\n" +',
'        "  |> filter(fn: (r) => r._measurement == \\"drive_data\\")\\n" +',
'        "  |> filter(fn: (r) => " + fieldFilter + ")\\n" +',
'        driveFilter + siteFilter +',
'        "\\nmeanData = data |> mean() |> set(key: \\"_stat\\", value: \\"mean\\")\\n" +',
'        "maxData = data |> max() |> set(key: \\"_stat\\", value: \\"max\\")\\n" +',
'        "union(tables: [meanData, maxData])\\n" +',
'        "  |> yield(name: \\"result\\")";',
'',
'    // Store query params for when result comes back',
'    flow.set("reportQuery", {start: p.start, stop: p.stop, drives: p.drives});',
'',
'    // Build HTTP request msg for the http-request node',
'    var influxToken = global.get("influxToken") || "HWS-AhZbFYzlY-k3SUP9sY0ygF0t6-wKl36_g8WTls8fX9b4jfJAkPo4Oayimq5Fq3HMMg2OW7BOuV1oBNCegg==";',
'    msg.url = "http://influxdb:8086/api/v2/query?org=" + encodeURIComponent("tecnoelectric");',
'    msg.method = "POST";',
'    msg.headers = {',
'        "Authorization": "Token " + influxToken,',
'        "Content-Type": "application/vnd.flux",',
'        "Accept": "application/csv"',
'    };',
'    msg.payload = flux;',
'    node.status({fill:"blue",shape:"ring",text:"Querying InfluxDB..."});',
'    return [null, msg, null];',
'}',
'',
'// --- Process InfluxDB query result (CSV) ---',
'if (topic === "queryResult") {',
'    var csv = msg.payload || "";',
'    if (typeof csv !== "string") csv = csv.toString();',
'    var lines = csv.split("\\n");',
'',
'    // Parse header to find column indices',
'    var header = null;',
'    var colIdx = {};',
'    var results = {};',
'    for (var i = 0; i < lines.length; i++) {',
'        var line = lines[i].trim();',
'        if (!line || line.startsWith("#")) continue;',
'        var cols = line.split(",");',
'        // First non-empty non-comment line with ",result,table" is the header',
'        if (!header && cols.indexOf("_value") !== -1) {',
'            header = cols;',
'            for (var hi = 0; hi < cols.length; hi++) colIdx[cols[hi]] = hi;',
'            continue;',
'        }',
'        if (!header) continue;',
'        if (cols.length < 6) continue;',
'        var val = parseFloat(cols[colIdx._value]) || 0;',
'        var field = cols[colIdx._field] || "";',
'        var stat = cols[colIdx._stat] || "";',
'        var driveName = cols[colIdx.name] || "";',
'        var site = cols[colIdx.site] || "";',
'',
'        if (!driveName || !field || !stat) continue;',
'        if (!results[driveName]) results[driveName] = {name: driveName, site: site};',
'        results[driveName][field + "_" + stat] = val;',
'    }',
'',
'    // Build report rows',
'    var reportData = [];',
'    var keys = Object.keys(results);',
'    for (var k = 0; k < keys.length; k++) {',
'        var r = results[keys[k]];',
'        var runMean = r.running_mean || 0;',
'        reportData.push({',
'            name: r.name,',
'            site: r.site || "-",',
'            currentMean: (r.current_mean || 0).toFixed(1),',
'            currentMax: (r.current_max || 0).toFixed(1),',
'            voltageMean: (r.voltage_mean || 0).toFixed(0),',
'            frequencyMean: (r.frequency_mean || 0).toFixed(1),',
'            powerMean: (r.power_mean || 0).toFixed(1),',
'            powerMax: (r.power_max || 0).toFixed(1),',
'            tempMax: (r.motor_temp_max || 0).toFixed(0),',
'            runPct: (runMean * 100).toFixed(0) + "%"',
'        });',
'    }',
'',
'    node.status({fill:"green",shape:"dot",text:reportData.length + " drives"});',
'    return [{topic: "reportData", payload: reportData}, null, null];',
'}',
'',
'// --- Send Email ---',
'if (topic === "sendEmail") {',
'    var p = msg.payload;',
'    if (!p.data || !p.recipients || !p.recipients.length) return null;',
'',
'    // Build HTML email',
'    var html = \'<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">\';',
'    html += \'<div style="background:#16a34a;padding:20px;border-radius:8px 8px 0 0">\';',
'    html += \'<h2 style="color:#fff;margin:0">Reporte WEG SCADA</h2>\';',
'    html += \'<p style="color:#dcfce7;margin:4px 0 0 0">\' + (p.period || "Reporte") + \' &mdash; \' + new Date().toLocaleDateString("es-PY") + \'</p>\';',
'    html += \'</div>\';',
'    html += \'<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">\';',
'    html += \'<tr style="background:#f1f5f9"><th style="p:8px;text-align:left;border:1px solid #e5e7eb">Dispositivo</th><th style="p:8px;border:1px solid #e5e7eb">Sitio</th><th style="p:8px;border:1px solid #e5e7eb;text-align:right">Corriente Prom</th><th style="p:8px;border:1px solid #e5e7eb;text-align:right">Corriente Max</th><th style="p:8px;border:1px solid #e5e7eb;text-align:right">Tension Prom</th><th style="p:8px;border:1px solid #e5e7eb;text-align:right">Potencia Prom</th><th style="p:8px;border:1px solid #e5e7eb;text-align:right">Potencia Max</th><th style="p:8px;border:1px solid #e5e7eb;text-align:right">Temp Max</th><th style="p:8px;border:1px solid #e5e7eb;text-align:right">% Enc.</th></tr>\';',
'    for (var i = 0; i < p.data.length; i++) {',
'        var r = p.data[i];',
'        var bg = i % 2 === 0 ? "#fff" : "#f9fafb";',
'        html += \'<tr style="background:\' + bg + \'"><td style="p:8px;border:1px solid #e5e7eb;font-weight:600">\' + r.name + \'</td><td style="p:8px;border:1px solid #e5e7eb">\' + r.site + \'</td><td style="p:8px;border:1px solid #e5e7eb;text-align:right">\' + r.currentMean + \' A</td><td style="p:8px;border:1px solid #e5e7eb;text-align:right;color:#ef4444">\' + r.currentMax + \' A</td><td style="p:8px;border:1px solid #e5e7eb;text-align:right">\' + r.voltageMean + \' V</td><td style="p:8px;border:1px solid #e5e7eb;text-align:right">\' + r.powerMean + \' kW</td><td style="p:8px;border:1px solid #e5e7eb;text-align:right;color:#ef4444">\' + r.powerMax + \' kW</td><td style="p:8px;border:1px solid #e5e7eb;text-align:right">\' + r.tempMax + \' &deg;C</td><td style="p:8px;border:1px solid #e5e7eb;text-align:right">\' + r.runPct + \'</td></tr>\';',
'    }',
'    html += \'</table>\';',
'    html += \'<p style="color:#999;font-size:0.8em;margin-top:16px">Generado automaticamente por WEG SCADA Monitoring &mdash; \' + new Date().toLocaleString("es-PY") + \'</p>\';',
'    html += \'</div>\';',
'',
'    // Build email message for node-red-node-email',
'    var emailMsg = {',
'        to: p.recipients.join(","),',
'        topic: "Reporte WEG SCADA - " + (p.period || "") + " " + new Date().toLocaleDateString("es-PY"),',
'        payload: html,',
'        _smtp: p.smtp',
'    };',
'    return [null, null, emailMsg];',
'}',
'',
'// --- Scheduled report trigger ---',
'if (topic === "scheduledReport") {',
'    var cfg = global.get("reportConfig") || {};',
'    if (!cfg.recipients || !cfg.recipients.length || !cfg.smtp || !cfg.smtp.user) {',
'        node.status({fill:"yellow",shape:"ring",text:"No recipients/SMTP configured"});',
'        return null;',
'    }',
'    // Generate last 24h/7d/30d report based on schedule',
'    var now = new Date();',
'    var start;',
'    if (cfg.schedule === "daily") start = new Date(now.getTime() - 24*60*60*1000);',
'    else if (cfg.schedule === "weekly") start = new Date(now.getTime() - 7*24*60*60*1000);',
'    else if (cfg.schedule === "monthly") start = new Date(now.getTime() - 30*24*60*60*1000);',
'    else return null;',
'',
'    // Store scheduled email config so we can send after query',
'    flow.set("scheduledEmail", {recipients: cfg.recipients, smtp: cfg.smtp, schedule: cfg.schedule});',
'',
'    msg.topic = "generateReport";',
'    msg.payload = {start: start.toISOString(), stop: now.toISOString(), drives: [], sites: []};',
'    // Re-enter this function with generateReport',
'    return [null, null, null]; // Will be handled by re-routing',
'}',
'',
'return null;'
].join('\n');

f.push({
    id: handlerId, type: 'function', z: 'weg_d2_tab',
    name: 'Report Handler',
    func: handlerFunc,
    outputs: 3, // output 1: back to form, output 2: to http-request, output 3: to email
    x: 900, y: 600,
    wires: [['weg_d2_report_form'], ['weg_d2_report_http'], ['weg_d2_report_emailer']]
});
console.log('Created report handler (3 outputs)');

// ============================================================
// 4. HTTP REQUEST NODE (for InfluxDB queries)
// ============================================================
var httpId = 'weg_d2_report_http';
existing = f.find(function(n){return n.id===httpId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: httpId, type: 'http request', z: 'weg_d2_tab',
    name: 'InfluxDB Query',
    method: 'use',  // use msg.method
    ret: 'txt',     // return text
    paytoqs: 'ignore',
    url: '',
    tls: '',
    persist: false,
    proxy: '',
    insecureHTTPParser: false,
    authType: '',
    senderr: false,
    headers: [],
    x: 1100, y: 620,
    wires: [['weg_d2_report_http_resp']]
});
console.log('Created HTTP request node');

// ============================================================
// 5. HTTP RESPONSE PROCESSOR (converts response back to handler)
// ============================================================
var httpRespId = 'weg_d2_report_http_resp';
existing = f.find(function(n){return n.id===httpRespId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: httpRespId, type: 'function', z: 'weg_d2_tab',
    name: 'Query Result',
    func: 'msg.topic = "queryResult";\nreturn msg;',
    outputs: 1,
    x: 1300, y: 620,
    wires: [['weg_d2_report_handler']]
});
console.log('Created HTTP response processor');

// ============================================================
// 6. EMAIL SENDER NODE (uses nodemailer via functionExternalModules)
// ============================================================
var emailerId = 'weg_d2_report_emailer';
existing = f.find(function(n){return n.id===emailerId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: emailerId, type: 'function', z: 'weg_d2_tab',
    name: 'Send Email (nodemailer)',
    func: [
        'if (!msg.to || !msg._smtp || !msg._smtp.user || !msg._smtp.pass) {',
        '    node.warn("Email: missing to/smtp credentials");',
        '    return {topic: "emailSent", payload: false};',
        '}',
        '',
        'var transporter = nodemailer.createTransport({',
        '    host: "smtp.gmail.com",',
        '    port: 465,',
        '    secure: true,',
        '    auth: { user: msg._smtp.user, pass: msg._smtp.pass }',
        '});',
        '',
        'var mailOpts = {',
        '    from: "WEG SCADA <" + msg._smtp.user + ">",',
        '    to: msg.to,',
        '    subject: msg.topic || "Reporte WEG SCADA",',
        '    html: msg.payload',
        '};',
        '',
        'try {',
        '    await transporter.sendMail(mailOpts);',
        '    node.status({fill:"green",shape:"dot",text:"Email sent to " + msg.to});',
        '    return {topic: "emailSent", payload: true};',
        '} catch(e) {',
        '    node.warn("Email error: " + e.message);',
        '    node.status({fill:"red",shape:"dot",text:"Error: " + e.message});',
        '    return {topic: "emailSent", payload: false};',
        '}'
    ].join('\n'),
    libs: [{var: "nodemailer", module: "nodemailer"}],
    outputs: 1,
    x: 1100, y: 660,
    wires: [['weg_d2_report_form']]
});
console.log('Created email sender (nodemailer)');

// ============================================================
// 9. SCHEDULER (hourly inject + cron check function)
// ============================================================
var schedulerId = 'weg_d2_report_scheduler';
existing = f.find(function(n){return n.id===schedulerId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: schedulerId, type: 'inject', z: 'weg_d2_tab',
    name: 'Report Scheduler (hourly)',
    props: [{p:'topic',vt:'str',v:'checkSchedule'}],
    repeat: '3600',  // every hour
    crontab: '',
    once: false,
    onceDelay: '60',
    topic: 'checkSchedule',
    x: 700, y: 700,
    wires: [['weg_d2_report_cron_fn']]
});
console.log('Created scheduler inject (hourly)');

var cronFnId = 'weg_d2_report_cron_fn';
existing = f.find(function(n){return n.id===cronFnId});
if (existing) { f.splice(f.indexOf(existing), 1); }

f.push({
    id: cronFnId, type: 'function', z: 'weg_d2_tab',
    name: 'Check Schedule',
    func: [
        'var cfg = global.get("reportConfig") || {};',
        'if (!cfg.schedule || cfg.schedule === "none") return null;',
        'if (!cfg.recipients || !cfg.recipients.length) return null;',
        'if (!cfg.smtp || !cfg.smtp.user) return null;',
        '',
        'var now = new Date();',
        'var hour = now.getHours();',
        'var day = now.getDay(); // 0=Sun',
        'var date = now.getDate();',
        'var targetHour = cfg.scheduleHour || 8;',
        '',
        'var shouldFire = false;',
        'if (cfg.schedule === "daily" && hour === targetHour) shouldFire = true;',
        'if (cfg.schedule === "weekly" && hour === targetHour && day === (cfg.scheduleDay || 1)) shouldFire = true;',
        'if (cfg.schedule === "monthly" && hour === targetHour && date === 1) shouldFire = true;',
        '',
        'if (!shouldFire) return null;',
        '',
        '// Prevent duplicate sends within the same hour',
        'var lastSent = flow.get("lastReportSent") || "";',
        'var key = cfg.schedule + "_" + now.toISOString().substring(0, 13);',
        'if (lastSent === key) return null;',
        'flow.set("lastReportSent", key);',
        '',
        '// Determine time range',
        'var start;',
        'if (cfg.schedule === "daily") start = new Date(now.getTime() - 24*60*60*1000);',
        'else if (cfg.schedule === "weekly") start = new Date(now.getTime() - 7*24*60*60*1000);',
        'else start = new Date(now.getTime() - 30*24*60*60*1000);',
        '',
        '// Store email config for after query completes',
        'flow.set("scheduledEmail", {recipients: cfg.recipients, smtp: cfg.smtp, schedule: cfg.schedule});',
        '',
        'node.status({fill:"blue",shape:"dot",text:"Generating scheduled report"});',
        'msg.topic = "generateReport";',
        'msg.payload = {start: start.toISOString(), stop: now.toISOString(), drives: [], sites: []};',
        'return msg;'
    ].join('\n'),
    outputs: 1,
    x: 900, y: 700,
    wires: [['weg_d2_report_handler']]
});
console.log('Created cron check function');

// ============================================================
// 10. UPDATE HANDLER: after query result, if scheduled, auto-send email
// ============================================================
// We need to modify the handler to check for scheduled email after building report
var handler = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (handler) {
    // Add scheduled email sending after queryResult processing
    handler.func = handler.func.replace(
        "    node.status({fill:\"green\",shape:\"dot\",text:reportData.length + \" drives\"});\n" +
        "    return [{topic: \"reportData\", payload: reportData}, null, null];\n" +
        "}",

        "    node.status({fill:\"green\",shape:\"dot\",text:reportData.length + \" drives\"});\n" +
        "\n" +
        "    // Check if this was a scheduled report\n" +
        "    var scheduled = flow.get(\"scheduledEmail\");\n" +
        "    if (scheduled && scheduled.recipients && scheduled.recipients.length) {\n" +
        "        flow.set(\"scheduledEmail\", null);\n" +
        "        var periodName = scheduled.schedule === \"daily\" ? \"Diario\" : scheduled.schedule === \"weekly\" ? \"Semanal\" : \"Mensual\";\n" +
        "        // Build HTML email\n" +
        "        var html = '<div style=\"font-family:Arial,sans-serif;max-width:800px;margin:0 auto\">';\n" +
        "        html += '<div style=\"background:#16a34a;padding:20px;border-radius:8px 8px 0 0\">';\n" +
        "        html += '<h2 style=\"color:#fff;margin:0\">Reporte WEG SCADA</h2>';\n" +
        "        html += '<p style=\"color:#dcfce7;margin:4px 0 0 0\">' + periodName + ' &mdash; ' + new Date().toLocaleDateString('es-PY') + '</p>';\n" +
        "        html += '</div>';\n" +
        "        html += '<table style=\"width:100%;border-collapse:collapse;border:1px solid #e5e7eb\">';\n" +
        "        html += '<tr style=\"background:#f1f5f9\"><th style=\"padding:8px;text-align:left;border:1px solid #e5e7eb\">Dispositivo</th><th style=\"padding:8px;border:1px solid #e5e7eb\">Sitio</th><th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">Corriente Prom</th><th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">Corriente Max</th><th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">Tension Prom</th><th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">Potencia Prom</th><th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">Temp Max</th><th style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">% Enc.</th></tr>';\n" +
        "        for (var ei = 0; ei < reportData.length; ei++) {\n" +
        "            var er = reportData[ei];\n" +
        "            var ebg = ei % 2 === 0 ? '#fff' : '#f9fafb';\n" +
        "            html += '<tr style=\"background:' + ebg + '\"><td style=\"padding:8px;border:1px solid #e5e7eb;font-weight:600\">' + er.name + '</td><td style=\"padding:8px;border:1px solid #e5e7eb\">' + er.site + '</td><td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">' + er.currentMean + ' A</td><td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;color:#ef4444\">' + er.currentMax + ' A</td><td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">' + er.voltageMean + ' V</td><td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">' + er.powerMean + ' kW</td><td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">' + er.tempMax + ' C</td><td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right\">' + er.runPct + '</td></tr>';\n" +
        "        }\n" +
        "        html += '</table>';\n" +
        "        html += '<p style=\"color:#999;font-size:0.8em;margin-top:16px\">Generado automaticamente por WEG SCADA Monitoring</p></div>';\n" +
        "        var emailMsg = {\n" +
        "            to: scheduled.recipients.join(','),\n" +
        "            topic: 'Reporte WEG SCADA - ' + periodName + ' ' + new Date().toLocaleDateString('es-PY'),\n" +
        "            payload: html,\n" +
        "            _smtp: scheduled.smtp\n" +
        "        };\n" +
        "        node.status({fill:\"green\",shape:\"dot\",text:\"Scheduled report sent\"});\n" +
        "        return [null, null, emailMsg];\n" +
        "    }\n" +
        "\n" +
        "    return [{topic: \"reportData\", payload: reportData}, null, null];\n" +
        "}"
    );
    console.log('Updated handler with scheduled email support');
}

// ============================================================
// SAVE
// ============================================================
fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\nReports page built. Nodes: ' + f.length);
