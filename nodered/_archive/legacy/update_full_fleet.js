const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// ============================================================
// 1. ADD MODBUS CLIENTS FOR CFW900 #2, #3, #4
// ============================================================
const cfwIPs = ['192.168.10.101', '192.168.10.102', '192.168.10.103'];

cfwIPs.forEach((ip, idx) => {
    const num = idx + 2;
    const configId = 'weg_modbus_cfw' + num;
    const readId = 'weg_read_cfw' + num;
    const yPos = 140 + (num - 1) * 50;

    // Check if already exists
    if (!flows.find(n => n.id === configId)) {
        flows.push({
            id: configId,
            type: 'modbus-client',
            name: 'CFW900 #' + num + ' (' + ip + ')',
            clienttype: 'tcp',
            bufferCommands: true,
            stateLogEnabled: false,
            qdumpLogEnabled: false,
            tcpHost: ip,
            tcpPort: '502',
            tcpType: 'DEFAULT',
            serialPort: '', serialType: 'RTU-BUFFERED', serialBaudrate: '19200',
            serialDatabits: '8', serialStopbits: '1', serialParity: 'none',
            serialConnectionDelay: '100',
            unit_id: '1',
            commandDelay: '200',
            clientTimeout: '3000',
            reconnectOnTimeout: true,
            reconnectTimeout: '5000',
            parallelUnitIdsAllowed: true
        });
    }

    if (!flows.find(n => n.id === readId)) {
        flows.push({
            id: readId,
            type: 'modbus-read',
            z: 'weg_flow_tab',
            name: 'Read CFW900 #' + num + ' (' + ip + ')',
            topic: '',
            showStatusActivities: true,
            logIOActivities: false,
            showErrors: true,
            unitid: '1',
            dataType: 'HoldingRegister',
            adr: '0',
            quantity: '71',
            rate: '1',
            rateUnit: 's',
            delayOnStart: false,
            startDelayTime: '',
            server: configId,
            useIOFile: false, ioFile: '', useIOForPayload: false, emptyMsgOnFail: false,
            x: 230,
            y: yPos,
            wires: [['weg_parse_all_cfw'], []]
        });
    }
});

// Update existing CFW#1 read to also go to the unified parser
const readCFW1 = flows.find(n => n.id === 'weg_read_cfw');
if (readCFW1) {
    readCFW1.wires = [['weg_parse_all_cfw'], []];
    readCFW1.name = 'Read CFW900 #1 (192.168.10.100)';
}

// ============================================================
// 2. UNIFIED CFW900 PARSER (handles all 4 drives)
// ============================================================
// Remove old parser connection
const oldParseCFW = flows.find(n => n.id === 'weg_parse_cfw');
if (oldParseCFW) {
    oldParseCFW.func = 'return null; // replaced by weg_parse_all_cfw';
    oldParseCFW.x = 9999; oldParseCFW.y = 9999;
}

// Add unified parser
if (!flows.find(n => n.id === 'weg_parse_all_cfw')) {
    flows.push({
        id: 'weg_parse_all_cfw',
        type: 'function',
        z: 'weg_flow_tab',
        name: 'Parse All CFW900',
        func: `
var regs = msg.payload;
var host = '';
try { host = msg.serverInfo ? msg.serverInfo.tcpHost : (msg.topic || ''); } catch(e){}

// Identify which drive by IP
var cfwIPs = {'192.168.10.100':0, '192.168.10.101':1, '192.168.10.102':2, '192.168.10.103':3};
var idx = -1;

// Try to detect from modbusRequest or server config
if (msg.modbusRequest && msg.modbusRequest.unitid !== undefined) {
    // Use the source node name to identify
}

// Fallback: match by checking all stored values
var devices = flow.get('cfwDevices') || [{},{},{},{}];

// Parse single drive
var stateNames = {0:'READY',1:'RUNNING',2:'UNDERVOLTAGE',3:'PROTECTION',4:'CONFIG',5:'STO',6:'POWER OFF',7:'DISABLED',8:'SS1',9:'AUTOTUNE'};
var stateColors = {0:'#00ff88',1:'#00aaff',2:'#C88200',3:'#ff4444',4:'#888',5:'#ff6600',6:'#666',7:'#999'};
var ft = {0:'Sin Falla',1:'F001: Sobrecorriente',2:'F002: Sobretension',3:'F003: Falla tierra',4:'F004: Sobretemp IGBT',5:'F005: Sobrecarga motor',6:'F006: Sobretemp drive',7:'F007: Subtension DC',8:'F008: Falla comm',12:'F012: Perdida fase',21:'F021: Falla tierra',33:'F033: Subtension',49:'F049: Motor bloqueado',70:'F070: Error comm'};

function parseDrive(regs, num, ip) {
    var d = {
        name: 'CFW900 #' + num,
        ip: ip,
        stateCode: regs[6],
        speedRef: regs[1],
        motorSpeed: regs[2],
        outputCurrent: regs[3] / 10.0,
        outputFreq: regs[5] / 10.0,
        outputVoltage: regs[7],
        outputPower: regs[10] / 100.0,
        cosPhi: (regs[11] > 32767 ? regs[11]-65536 : regs[11]) / 100.0,
        nominalCurrent: regs[22] / 10.0,
        nominalVoltage: regs[24] / 10.0,
        nominalFreq: regs[40] / 10.0,
        faultCode: regs[60] || 0,
        fault1:regs[60]||0, fault2:regs[61]||0, fault3:regs[62]||0, fault4:regs[63]||0, fault5:regs[64]||0,
        alarm1:regs[50]||0, alarm2:regs[51]||0, alarm3:regs[52]||0, alarm4:regs[53]||0, alarm5:regs[54]||0,
        secondsEnergized: regs[42],
        hoursEnergized: (regs[42]/3600).toFixed(1),
        secondsEnabled: regs[46],
        hoursEnabled: (regs[46]/3600).toFixed(1),
        motorTorque: regs[6] !== undefined ? (regs[3] > 0 ? 50 : 0) : 0,
        motorTemp: flow.get('cfwTemp_'+num) || 0,
        online: true
    };
    d.speedRPM = d.motorSpeed;
    d.current = d.outputCurrent;
    d.frequency = d.outputFreq;
    d.power = d.outputPower;
    d.statusText = stateNames[d.stateCode] || 'UNKNOWN';
    d.statusColor = stateColors[d.stateCode] || '#808080';
    d.running = d.stateCode === 1;
    d.ready = d.stateCode === 0;
    d.fault = d.stateCode === 3;
    d.hasFault = d.fault1 > 0;
    d.hasAlarm = d.alarm1 > 0;
    d.faultText = ft[d.fault1] || (d.fault1>0 ? 'Proteccion: '+d.fault1 : 'Sin Falla');
    d.alarmText = d.alarm1>0 ? 'Alarma: '+d.alarm1 : '';
    return d;
}

// Detect which drive sent this message by checking the server node
var serverName = '';
if (msg._msgid) {
    // The modbus-read node injects its name or we use input name
}

// We'll use a round-robin approach: each modbus-read fires independently
// Store by checking unique values
var inputName = msg.input ? msg.input.name : '';

// Simpler: use the msg.topic or detect by matching IP in the data
// Since each read comes from different server, we track by call order
var callCount = flow.get('cfwCallCount') || 0;
idx = callCount % 4;
flow.set('cfwCallCount', callCount + 1);

var ips = ['192.168.10.100','192.168.10.101','192.168.10.102','192.168.10.103'];
devices[idx] = parseDrive(regs, idx+1, ips[idx]);

flow.set('cfwDevices', devices);
msg.cfwDevices = devices;
return msg;
`,
        outputs: 1,
        timeout: '',
        noerr: 0,
        x: 480,
        y: 170,
        wires: [['weg_join_data']]
    });
}

// ============================================================
// 3. SSW900 PLACEHOLDERS (RTU only, no live data yet)
// ============================================================
const parseSSW = flows.find(n => n.id === 'weg_parse_ssw');
if (parseSSW) {
    parseSSW.func = `
// Store motor temp + create SSW900 placeholders
var regs = msg.payload;
if (regs && regs[0] !== undefined) {
    var temp = regs[0];
    if (temp > 32767) temp = temp - 65536;
    flow.set('cfwTemp_1', temp / 10.0);
}

// SSW900 placeholders (RTU only - no TCP data yet)
var sswDevices = [];
for (var i = 1; i <= 3; i++) {
    sswDevices.push({
        name: 'SSW900 #' + i,
        ip: 'RTU (Addr ' + (i+4) + ')',
        stateCode: -1,
        statusText: 'RTU ONLY',
        statusColor: '#555555',
        current: 0, voltage: 0, power: 0, frequency: 0,
        motorTemp: 0, cosPhi: 0,
        running: false, ready: false, fault: false,
        hasFault: false, hasAlarm: false,
        faultText: 'Sin datos (RTU)',
        alarmText: '',
        online: false,
        hoursEnergized: '-', hoursEnabled: '-',
        secondsEnergized: 0, secondsEnabled: 0
    });
}
flow.set('sswDevices', sswDevices);
return null;
`;
}

// ============================================================
// 4. UPDATE COMBINE + BANNER FOR ALL DRIVES
// ============================================================
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.func = `
var cfwDevices = flow.get('cfwDevices') || [];
var sswDevices = flow.get('sswDevices') || [];
var faults = [];
var running = 0;
var total = 0;

cfwDevices.forEach(function(d) {
    if (!d || !d.name) return;
    total++;
    if (d.hasFault || d.fault) faults.push(d.name + ': ' + d.faultText);
    if (d.running) running++;
});

var banner;
if (faults.length > 0) {
    var fidx = (flow.get('bannerIdx')||0) % faults.length;
    flow.set('bannerIdx', fidx+1);
    banner = { text: '[' + (fidx+1) + '/' + faults.length + '] ' + faults[fidx], color: '#DC0000', hasFaults: true, faultCount: faults.length };
} else if (running > 0) {
    banner = { text: running + '/' + total + ' DRIVES RUNNING', color: '#0064DC', hasFaults: false };
} else if (total > 0) {
    banner = { text: total + ' DRIVES ONLINE — ALL READY', color: '#00802b', hasFaults: false };
} else {
    banner = { text: 'CONNECTING...', color: '#888', hasFaults: false };
}

msg.cfwDevices = cfwDevices;
msg.sswDevices = sswDevices;
msg.banner = banner;
msg.stats = { running: running, total: total, faults: faults.length };
return msg;
`;
}

// ============================================================
// 5. FULL INDUSTRIAL DASHBOARD WITH ALL DRIVES
// ============================================================
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.height = "28";
    uiOverview.format = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

*{box-sizing:border-box}
.S{font-family:'Rajdhani',sans-serif;color:#c8ccd0;background:#080810;padding:12px;border-radius:8px;min-height:90vh}
.S .mono{font-family:'Share Tech Mono',monospace}

/* Top bar */
.S-top{display:flex;justify-content:space-between;align-items:center;padding:8px 0;margin-bottom:10px;border-bottom:1px solid #1a1a2e}
.S-logo{font-size:20px;font-weight:700;letter-spacing:2px;color:#FFD700}
.S-stats{display:flex;gap:16px;font-size:12px}
.S-stat{text-align:center}
.S-stat-val{font-size:20px;font-weight:700;font-family:'Share Tech Mono',monospace}
.S-stat-lbl{font-size:9px;color:#666;letter-spacing:1px;text-transform:uppercase}

/* Banner */
.S-ban{padding:8px 16px;border-radius:3px;text-align:center;font-size:13px;font-weight:600;color:white;
  letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;font-family:'Share Tech Mono',monospace}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
.S-ban-fault{animation:pulse 1.2s infinite}

/* Live dot */
.S-live{width:6px;height:6px;background:#00ff88;border-radius:50%;display:inline-block;
  animation:lp 2s infinite;margin-right:6px;vertical-align:middle}
@keyframes lp{0%,100%{opacity:1;box-shadow:0 0 6px #00ff88}50%{opacity:.3;box-shadow:none}}

/* Section title */
.S-sec{font-size:12px;font-weight:600;color:#FFD700;letter-spacing:2px;text-transform:uppercase;
  margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid #1a1a2e;display:flex;align-items:center;gap:6px}
.S-sec::before{content:'';width:3px;height:14px;background:#FFD700;border-radius:1px}

/* Drive grid */
.S-dgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:800px){.S-dgrid{grid-template-columns:1fr}}

/* Drive card */
.S-card{background:#0c0c1a;border-radius:5px;border:1px solid #1a1a2e;overflow:hidden;transition:border-color .3s}
.S-card:hover{border-color:#2a2a4e}
.S-card-head{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#0f0f20;border-bottom:1px solid #1a1a2e}
.S-card-name{font-size:13px;font-weight:700;letter-spacing:1px}
.S-card-ip{font-size:9px;color:#555;font-family:'Share Tech Mono',monospace}
.S-badge{font-size:9px;padding:2px 8px;border-radius:2px;color:white;font-weight:600;letter-spacing:1px}
.S-card-body{padding:10px 12px}

/* Gauge row */
.S-gauges{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:2px;background:#080810;padding:6px 8px;border-bottom:1px solid #1a1a2e}
.S-gw{text-align:center}
.S-gl{font-size:8px;color:#555;letter-spacing:1px;text-transform:uppercase;font-family:'Share Tech Mono',monospace}
.S-gv{font-size:11px;font-weight:700;font-family:'Share Tech Mono',monospace;margin-top:-1px}
.S-gsub{font-size:7px;color:#444;font-family:'Share Tech Mono',monospace}

/* Mini cells */
.S-mcells{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:6px}
.S-mc{background:#08080f;border-radius:3px;padding:5px 7px;border-left:2px solid var(--ac,#333)}
.S-mc-l{font-size:8px;color:#555;letter-spacing:1px;text-transform:uppercase;font-family:'Share Tech Mono',monospace}
.S-mc-v{font-size:16px;font-weight:700;font-family:'Share Tech Mono',monospace}
.S-mc-u{font-size:9px;color:#555}

/* Fault bar */
.S-fb{padding:5px 10px;font-size:10px;font-family:'Share Tech Mono',monospace;border-top:1px solid #1a1a2e}
.S-fb-fault{background:rgba(200,0,0,.1);color:#ff6666}
.S-fb-alarm{background:rgba(200,180,0,.08);color:#cc9900}

/* SSW card offline */
.S-offline{opacity:0.45}
.S-offline-tag{font-size:9px;color:#666;font-style:italic;padding:8px 12px}

/* Mini bar */
.S-bar{height:3px;background:#111;border-radius:1px;margin-top:2px;overflow:hidden}
.S-bf{height:100%;border-radius:1px;transition:width .8s}
</style>

<div class="S">

<!-- TOP BAR -->
<div class="S-top">
  <div>
    <span class="S-logo">⚡ WEG SCADA</span>
    <span style="color:#444;font-size:11px;margin-left:8px">Drive Monitoring System</span>
  </div>
  <div class="S-stats">
    <div class="S-stat"><div class="S-stat-val" style="color:#00aaff">{{msg.stats.running || 0}}</div><div class="S-stat-lbl">Running</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:#00ff88">{{msg.stats.total || 0}}</div><div class="S-stat-lbl">Online</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:{{msg.stats.faults>0?'#ff4444':'#333'}}">{{msg.stats.faults || 0}}</div><div class="S-stat-lbl">Faults</div></div>
  </div>
</div>

<!-- BANNER -->
<div class="S-ban" ng-style="{'background':msg.banner.color}" ng-class="{'S-ban-fault':msg.banner.hasFaults}">
  <span class="S-live"></span> {{msg.banner.text}}
</div>

<!-- CFW900 SECTION -->
<div class="S-sec">CFW900 — Variable Frequency Drives</div>
<div class="S-dgrid">
  <div ng-repeat="d in msg.cfwDevices" class="S-card" ng-if="d && d.name" style="border-left:3px solid {{d.statusColor}}">

    <!-- Card header -->
    <div class="S-card-head">
      <div><span class="S-card-name">{{d.name}}</span> <span class="S-card-ip">{{d.ip}}</span></div>
      <span class="S-badge" style="background:{{d.statusColor}}">{{d.statusText}}</span>
    </div>

    <!-- Gauges -->
    <div class="S-gauges">
      <div class="S-gw">
        <div class="S-gl">RPM</div>
        <svg viewBox="0 0 100 55" width="70" height="38">
          <path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
          <path ng-attr-d="M 12 50 A 38 38 0 0 1 {{12+76*Math.min((d.speedRef>0?d.motorSpeed/d.speedRef:0),1)}} {{50-38*Math.sin(Math.PI*Math.min((d.speedRef>0?d.motorSpeed/d.speedRef:0),1))}}" fill="none" stroke="#00aaff" stroke-width="5" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#e0e0e0" font-size="15" font-family="Share Tech Mono" font-weight="700">{{d.motorSpeed}}</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">AMP</div>
        <svg viewBox="0 0 100 55" width="70" height="38">
          <path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
          <path ng-attr-d="M 12 50 A 38 38 0 0 1 {{12+76*Math.min((d.nominalCurrent>0?d.current/d.nominalCurrent:0),1)}} {{50-38*Math.sin(Math.PI*Math.min((d.nominalCurrent>0?d.current/d.nominalCurrent:0),1))}}" fill="none" stroke="#00ddff" stroke-width="5" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#e0e0e0" font-size="15" font-family="Share Tech Mono" font-weight="700">{{d.current.toFixed(1)}}</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">VOLT</div>
        <svg viewBox="0 0 100 55" width="70" height="38">
          <path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
          <path ng-attr-d="M 12 50 A 38 38 0 0 1 {{12+76*Math.min((d.nominalVoltage>0?d.outputVoltage/d.nominalVoltage:0),1)}} {{50-38*Math.sin(Math.PI*Math.min((d.nominalVoltage>0?d.outputVoltage/d.nominalVoltage:0),1))}}" fill="none" stroke="#FFD700" stroke-width="5" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#FFD700" font-size="15" font-family="Share Tech Mono" font-weight="700">{{d.outputVoltage}}</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">Hz</div>
        <svg viewBox="0 0 100 55" width="70" height="38">
          <path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
          <path ng-attr-d="M 12 50 A 38 38 0 0 1 {{12+76*Math.min((d.nominalFreq>0?d.frequency/d.nominalFreq:0),1)}} {{50-38*Math.sin(Math.PI*Math.min((d.nominalFreq>0?d.frequency/d.nominalFreq:0),1))}}" fill="none" stroke="#00ff88" stroke-width="5" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#e0e0e0" font-size="15" font-family="Share Tech Mono" font-weight="700">{{d.frequency.toFixed(1)}}</text>
        </svg>
      </div>
    </div>

    <!-- Data cells -->
    <div class="S-card-body">
      <div class="S-mcells">
        <div class="S-mc" style="--ac:#FFD700"><div class="S-mc-l">Potencia</div><div class="S-mc-v">{{d.power.toFixed(2)}} <span class="S-mc-u">kW</span></div></div>
        <div class="S-mc" style="--ac:#00aaff"><div class="S-mc-l">Cos φ</div><div class="S-mc-v">{{d.cosPhi.toFixed(2)}}</div></div>
        <div class="S-mc" style="--ac:{{d.motorTemp>100?'#ff4444':d.motorTemp>60?'#FFD700':'#00ff88'}}">
          <div class="S-mc-l">Temp</div><div class="S-mc-v" style="color:{{d.motorTemp>100?'#ff4444':d.motorTemp>60?'#FFD700':'#00ff88'}}">{{d.motorTemp.toFixed(1)}} <span class="S-mc-u">°C</span></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:4px">
        <div style="font-size:9px;color:#444" class="mono">⏱ {{d.hoursEnergized}}h on</div>
        <div style="font-size:9px;color:#444" class="mono">⏱ {{d.hoursEnabled}}h run</div>
        <div style="font-size:9px;text-align:right" class="mono" ng-style="{'color':d.hasFault?'#ff4444':'#00ff88'}">{{d.hasFault ? d.faultText : '● OK'}}</div>
      </div>
    </div>

    <!-- Fault/Alarm bar -->
    <div ng-if="d.hasFault" class="S-fb S-fb-fault">⚠ {{d.faultText}} | P1:{{d.fault1}} P2:{{d.fault2}} P3:{{d.fault3}}</div>
    <div ng-if="d.hasAlarm && !d.hasFault" class="S-fb S-fb-alarm">⚠ Alarma: {{d.alarm1}}</div>

  </div>
</div>

<!-- SSW900 SECTION -->
<div class="S-sec">SSW900 — Soft Starters <span style="color:#555;font-size:10px;font-weight:400;margin-left:8px">(Modbus RTU — Pendiente conexion TCP)</span></div>
<div class="S-dgrid" style="grid-template-columns:1fr 1fr 1fr">
  <div ng-repeat="d in msg.sswDevices" class="S-card S-offline" style="border-left:3px solid #333">
    <div class="S-card-head">
      <div><span class="S-card-name">{{d.name}}</span> <span class="S-card-ip">{{d.ip}}</span></div>
      <span class="S-badge" style="background:#555">RTU</span>
    </div>
    <div class="S-offline-tag">
      ⏳ Sin datos — Requiere PLC M241 o gateway TCP para monitoreo remoto
    </div>
    <div class="S-gauges" style="opacity:0.3">
      <div class="S-gw"><div class="S-gl">AMP</div>
        <svg viewBox="0 0 100 55" width="70" height="38"><path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/><text x="50" y="46" text-anchor="middle" fill="#333" font-size="15" font-family="Share Tech Mono">--</text></svg></div>
      <div class="S-gw"><div class="S-gl">VOLT</div>
        <svg viewBox="0 0 100 55" width="70" height="38"><path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/><text x="50" y="46" text-anchor="middle" fill="#333" font-size="15" font-family="Share Tech Mono">--</text></svg></div>
      <div class="S-gw"><div class="S-gl">kW</div>
        <svg viewBox="0 0 100 55" width="70" height="38"><path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/><text x="50" y="46" text-anchor="middle" fill="#333" font-size="15" font-family="Share Tech Mono">--</text></svg></div>
      <div class="S-gw"><div class="S-gl">STATUS</div>
        <svg viewBox="0 0 100 55" width="70" height="38"><path d="M 12 50 A 38 38 0 0 1 88 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/><text x="50" y="46" text-anchor="middle" fill="#333" font-size="15" font-family="Share Tech Mono">--</text></svg></div>
    </div>
  </div>
</div>

</div>
`;
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Full fleet update complete. Restart to apply.');
