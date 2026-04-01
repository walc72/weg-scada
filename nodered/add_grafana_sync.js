var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. Add Grafana Dashboard Updater function node
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_grafana_updater'; })) {
    f.push({
        id: 'weg_grafana_updater',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Grafana Updater',
        func: [
'// Read gauge config (use drive 0 as default thresholds)',
'var cfg = global.get("gaugeConfigPerDrive") || {};',
'var d0 = cfg["0"] || {};',
'',
'// Extract thresholds with defaults',
'var t = {',
'  current: { y: (d0.corriente||{}).green||80, r: (d0.corriente||{}).yellow||120 },',
'  speed: { y: (d0.velocidad||{}).green||1200, r: (d0.velocidad||{}).yellow||1500 },',
'  voltage: { y: (d0.tension||{}).green||380, r: (d0.tension||{}).yellow||480 },',
'  freq: { y: (d0.frecuencia||{}).green||50, r: (d0.frecuencia||{}).yellow||62 },',
'  power: { y: (d0.potencia||{}).green||60, r: (d0.potencia||{}).yellow||85 },',
'  temp: { y: (d0.temperatura||{}).green||60, r: (d0.temperatura||{}).yellow||100 }',
'};',
'',
'function tsQuery(field, fn) {',
'  fn = fn || "mean";',
'  return "from(bucket: \\"weg_drives\\")\\n  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"" + field + "\\")\\n  |> keep(columns: [\\"_time\\", \\"_value\\", \\"name\\"])\\n  |> aggregateWindow(every: v.windowPeriod, fn: " + fn + ", createEmpty: false)";',
'}',
'',
'function tsPanel(title, field, unit, yPos, thresh) {',
'  var p = {',
'    type: "timeseries", title: title,',
'    gridPos: {h:8,w:24,x:0,y:yPos},',
'    datasource: {type:"influxdb",uid:""},',
'    fieldConfig: {',
'      defaults: {',
'        color: {mode:"palette-classic"},',
'        custom: {lineWidth:2,fillOpacity:10,spanNulls:false},',
'        unit: unit',
'      },',
'      overrides: []',
'    },',
'    options: {legend:{displayMode:"table",placement:"right",calcs:["min","max","mean","lastNotNull"]},tooltip:{mode:"multi"}},',
'    targets: [{refId:"A",query:tsQuery(field)}]',
'  };',
'  if (thresh) {',
'    p.fieldConfig.defaults.thresholds = {steps:[{color:"green",value:null},{color:"yellow",value:thresh.y},{color:"red",value:thresh.r}]};',
'  }',
'  return p;',
'}',
'',
'// Temperature panel with threshold areas',
'var tempPanel = tsPanel("Temperatura Motor","motor_temp","celsius",44,t.temp);',
'tempPanel.fieldConfig.defaults.custom.thresholdsStyle = {mode:"line+area"};',
'tempPanel.fieldConfig.defaults.thresholds = {steps:[{color:"transparent",value:null},{color:"rgba(255,152,48,0.15)",value:t.temp.y},{color:"rgba(255,0,0,0.15)",value:t.temp.r}]};',
'',
'var dashboard = {',
'  annotations:{list:[]},editable:true,fiscalYearStartMonth:0,graphTooltip:1,links:[],',
'  panels: [',
'    {type:"stat",title:"Drives Online",gridPos:{h:4,w:4,x:0,y:0},datasource:{type:"influxdb",uid:""},',
'     fieldConfig:{defaults:{color:{mode:"thresholds"},thresholds:{steps:[{color:"red",value:null},{color:"yellow",value:1},{color:"green",value:4}]},mappings:[]},overrides:[]},',
'     options:{reduceOptions:{calcs:["lastNotNull"]},orientation:"auto",textMode:"auto",colorMode:"background"},',
'     targets:[{refId:"A",query:"from(bucket: \\"weg_drives\\")\\n  |> range(start: -1m)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"current\\")\\n  |> group()\\n  |> distinct(column: \\"name\\")\\n  |> count()"}]},',
'    {type:"stat",title:"Drives en Marcha",gridPos:{h:4,w:4,x:4,y:0},datasource:{type:"influxdb",uid:""},',
'     fieldConfig:{defaults:{color:{mode:"thresholds"},thresholds:{steps:[{color:"blue",value:null}]}},overrides:[]},',
'     options:{reduceOptions:{calcs:["lastNotNull"]},colorMode:"background"},',
'     targets:[{refId:"A",query:"from(bucket: \\"weg_drives\\")\\n  |> range(start: -30s)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"running\\" and r._value == true)\\n  |> group()\\n  |> distinct(column: \\"name\\")\\n  |> count()"}]},',
'    {type:"stat",title:"Fallas Activas",gridPos:{h:4,w:4,x:8,y:0},datasource:{type:"influxdb",uid:""},',
'     fieldConfig:{defaults:{color:{mode:"thresholds"},thresholds:{steps:[{color:"green",value:null},{color:"red",value:1}]},noValue:"0"},overrides:[]},',
'     options:{reduceOptions:{calcs:["lastNotNull"]},colorMode:"background"},',
'     targets:[{refId:"A",query:"from(bucket: \\"weg_drives\\")\\n  |> range(start: -30s)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"state_code\\" and r._value >= 2)\\n  |> group()\\n  |> distinct(column: \\"name\\")\\n  |> count()"}]},',
'    {type:"stat",title:"Corriente Total",gridPos:{h:4,w:6,x:12,y:0},datasource:{type:"influxdb",uid:""},',
'     fieldConfig:{defaults:{color:{mode:"thresholds"},thresholds:{steps:[{color:"green",value:null},{color:"yellow",value:t.current.y*4},{color:"red",value:t.current.r*4}]},unit:"amp",decimals:1},overrides:[]},',
'     options:{reduceOptions:{calcs:["lastNotNull"]},colorMode:"background",graphMode:"area"},',
'     targets:[{refId:"A",query:"from(bucket: \\"weg_drives\\")\\n  |> range(start: -30s)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"current\\")\\n  |> group()\\n  |> sum()"}]},',
'    {type:"stat",title:"Potencia Total",gridPos:{h:4,w:6,x:18,y:0},datasource:{type:"influxdb",uid:""},',
'     fieldConfig:{defaults:{color:{mode:"thresholds"},thresholds:{steps:[{color:"green",value:null},{color:"yellow",value:t.power.y*4},{color:"red",value:t.power.r*4}]},unit:"kwatt",decimals:2},overrides:[]},',
'     options:{reduceOptions:{calcs:["lastNotNull"]},colorMode:"background",graphMode:"area"},',
'     targets:[{refId:"A",query:"from(bucket: \\"weg_drives\\")\\n  |> range(start: -30s)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"power\\")\\n  |> group()\\n  |> sum()"}]},',
'    tsPanel("Corriente por Drive","current","amp",4,t.current),',
'    tsPanel("Velocidad Motor","motor_speed","rotrpm",12,t.speed),',
'    tsPanel("Tension de Salida","voltage","volt",20,t.voltage),',
'    tsPanel("Frecuencia","frequency","hertz",28,t.freq),',
'    tsPanel("Potencia por Drive","power","kwatt",36,null),',
'    tempPanel,',
'    tsPanel("Factor de Potencia (Cos Phi)","cos_phi","",52,null),',
'    {type:"state-timeline",title:"Estado de Drives (Timeline)",gridPos:{h:6,w:24,x:0,y:60},datasource:{type:"influxdb",uid:""},',
'     fieldConfig:{defaults:{color:{mode:"thresholds"},thresholds:{steps:[{color:"green",value:null},{color:"yellow",value:1},{color:"red",value:2}]},',
'      mappings:[{type:"value",options:{"0":{text:"READY",color:"green"}}},{type:"value",options:{"1":{text:"RUN",color:"blue"}}},{type:"value",options:{"2":{text:"FAULT",color:"red"}}}],',
'      custom:{fillOpacity:80}},overrides:[]},',
'     options:{showValue:"auto",mergeValues:true,alignValue:"left",legend:{displayMode:"list",placement:"bottom"}},',
'     targets:[{refId:"A",query:tsQuery("state_code","last")}]}',
'  ],',
'  refresh:"10s",schemaVersion:39,tags:["weg","scada","drives"],',
'  templating:{list:[',
'    {name:"drive",type:"query",datasource:{type:"influxdb",uid:""},query:"import \\"influxdata/influxdb/schema\\"\\nschema.tagValues(bucket: \\"weg_drives\\", tag: \\"name\\")",multi:true,includeAll:true,current:{selected:true,text:"All",value:"$__all"},refresh:1},',
'    {name:"site",type:"query",datasource:{type:"influxdb",uid:""},query:"import \\"influxdata/influxdb/schema\\"\\nschema.tagValues(bucket: \\"weg_drives\\", tag: \\"site\\")",multi:true,includeAll:true,current:{selected:true,text:"All",value:"$__all"},refresh:1}',
'  ]},',
'  time:{from:"now-1h",to:"now"},timepicker:{},timezone:"browser",',
'  title:"WEG Drives - Overview",uid:"weg-overview",version:1',
'};',
'',
'msg.payload = JSON.stringify({dashboard: dashboard, overwrite: true});',
'msg.headers = {',
'  "Content-Type": "application/json",',
'  "Authorization": "Basic " + Buffer.from("admin:WegGrafana2026!").toString("base64")',
'};',
'msg.url = "http://projects-grafana-1:3000/api/dashboards/db";',
'msg.method = "POST";',
'node.status({fill:"blue",shape:"dot",text:"Updating Grafana..."});',
'return msg;'
        ].join('\n'),
        outputs: 1,
        x: 520,
        y: 500,
        wires: [['weg_grafana_http']]
    });
    console.log('Added Grafana Updater function');
}

// ============================================================
// 2. Add HTTP request node for Grafana API
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_grafana_http'; })) {
    f.push({
        id: 'weg_grafana_http',
        type: 'http request',
        z: 'weg_d2_tab',
        name: 'Grafana API',
        method: 'use',
        ret: 'txt',
        paytoqs: 'ignore',
        url: '',
        tls: '',
        persist: false,
        proxy: '',
        insecureHTTPParser: false,
        authType: '',
        senderr: false,
        headers: [],
        x: 720,
        y: 500,
        wires: [['weg_grafana_status']]
    });
    console.log('Added Grafana HTTP request node');
}

// ============================================================
// 3. Add status node for Grafana response
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_grafana_status'; })) {
    f.push({
        id: 'weg_grafana_status',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Grafana Status',
        func: 'if (msg.statusCode === 200) {\n  node.status({fill:"green",shape:"dot",text:"Grafana updated"});\n} else {\n  node.status({fill:"red",shape:"dot",text:"Error: " + msg.statusCode});\n  node.warn("Grafana update failed: " + msg.payload);\n}\nreturn null;',
        outputs: 0,
        x: 900,
        y: 500,
        wires: []
    });
    console.log('Added Grafana Status node');
}

// ============================================================
// 4. Update config handler: add output 3 for Grafana sync
// ============================================================
var handler = f.find(function(n){ return n.id === 'weg_d2_config_handler'; });
if (handler) {
    // Add Grafana trigger after saveFull
    handler.func = handler.func.replace(
        'return [msg, fileMsg];',
        'var grafanaMsg = {topic: "updateGrafana"};\n    return [msg, fileMsg, grafanaMsg];'
    );
    handler.outputs = 3;
    handler.wires = [['weg_d2_config_form'], ['weg_config_file_write'], ['weg_grafana_updater']];
    console.log('Updated config handler: 3 outputs (+ Grafana sync)');
}

// ============================================================
// 5. Also add an inject to sync on startup
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_grafana_init'; })) {
    f.push({
        id: 'weg_grafana_init',
        type: 'inject',
        z: 'weg_d2_tab',
        name: 'Grafana Sync (startup)',
        repeat: '',
        once: true,
        onceDelay: '15',
        topic: 'updateGrafana',
        props: [],
        x: 320,
        y: 500,
        wires: [['weg_grafana_updater']]
    });
    console.log('Added Grafana startup sync inject');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\nDone. Nodes:', f.length);
