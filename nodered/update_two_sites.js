const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// ============================================================
// 1. FIX: Offline drives must show as OFFLINE, not READY
// ============================================================
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.func = `
var raw = flow.get('cfwDevices') || [];
var sswDevices = flow.get('sswDevices') || [];

var cfwIPs = ['192.168.10.100','192.168.10.101','192.168.10.102','192.168.10.103'];
var cfwDevices = [];
for (var i = 0; i < 4; i++) {
    if (raw[i] && raw[i].online === true) {
        cfwDevices.push(raw[i]);
    } else {
        cfwDevices.push({
            name: 'CFW900 #' + (i+1), ip: cfwIPs[i],
            stateCode: -1, statusText: 'OFFLINE', statusColor: '#94a3b8',
            speedRef:0, motorSpeed:0, speedRPM:0,
            outputCurrent:0, current:0, outputFreq:0, frequency:0,
            outputVoltage:0, outputPower:0, power:0, cosPhi:0,
            nominalCurrent:0, nominalVoltage:0, nominalFreq:0,
            motorTorque:0, motorTemp:0,
            fault1:0,fault2:0,fault3:0,fault4:0,fault5:0,
            alarm1:0,alarm2:0,alarm3:0,alarm4:0,alarm5:0,
            hoursEnergized:'-', hoursEnabled:'-',
            secondsEnergized:0, secondsEnabled:0,
            running:false, ready:false, fault:false,
            hasFault:false, hasAlarm:false,
            faultText:'Sin conexion', alarmText:'', online:false
        });
    }
}

// AGRIPLUS: CFW #1-4 + SSW #1-2
var agriplus = { cfwDevices: cfwDevices, sswDevices: sswDevices.slice(0, 2) };
// AGROCARAYA: SSW #3
var agrocaraya = { sswDevices: sswDevices.slice(2, 3) };

var faults = [];
var running = 0;
var online = 0;
cfwDevices.forEach(function(d) {
    if (d.online) online++;
    if (d.hasFault || d.fault) faults.push(d.name + ': ' + d.faultText);
    if (d.running) running++;
});

var banner;
if (faults.length > 0) {
    var fidx = (flow.get('bannerIdx')||0) % faults.length;
    flow.set('bannerIdx', fidx+1);
    banner = { text: '[' + (fidx+1) + '/' + faults.length + '] ' + faults[fidx], color: '#dc2626', hasFaults: true };
} else if (running > 0) {
    banner = { text: running + '/' + online + ' DRIVES RUNNING', color: '#2563eb', hasFaults: false };
} else if (online > 0) {
    banner = { text: online + '/4 DRIVES ONLINE — ALL READY', color: '#16a34a', hasFaults: false };
} else {
    banner = { text: 'CONNECTING...', color: '#94a3b8', hasFaults: false };
}

msg.agriplus = agriplus;
msg.agrocaraya = agrocaraya;
msg.cfwDevices = cfwDevices;
msg.sswDevices = sswDevices;
msg.banner = banner;
msg.stats = { running: running, total: online, faults: faults.length, offline: 4 - online };
return msg;
`;
    // Wire combine to both pages
    combine.wires = [['weg_ui_overview', 'weg_ui_agrocaraya', 'weg_alarm_detector', 'weg_voltage_monitor', 'weg_csv_builder']];
    console.log('Fixed combine + added site split');
}

// ============================================================
// 2. RENAME OVERVIEW TAB TO "AGRIPLUS"
// ============================================================
const tabOverview = flows.find(n => n.id === 'weg_ui_tab_overview');
if (tabOverview) {
    tabOverview.name = 'Agriplus';
    tabOverview.icon = 'fa-industry';
    tabOverview.order = 1;
    console.log('Renamed overview tab to Agriplus');
}

// ============================================================
// 3. CREATE AGROCARAYA TAB + GROUP + TEMPLATE
// ============================================================
if (!flows.find(n => n.id === 'weg_ui_tab_agrocaraya')) {
    flows.push({
        id: 'weg_ui_tab_agrocaraya',
        type: 'ui_tab',
        name: 'Agrocaraya',
        icon: 'fa-building',
        order: 2
    });
    console.log('Created Agrocaraya tab');
}

if (!flows.find(n => n.id === 'weg_ui_grp_agrocaraya')) {
    flows.push({
        id: 'weg_ui_grp_agrocaraya',
        type: 'ui_group',
        name: 'Agrocaraya',
        tab: 'weg_ui_tab_agrocaraya',
        order: 1,
        disp: false,
        width: '24',
        collapse: false
    });
    console.log('Created Agrocaraya group');
}

if (!flows.find(n => n.id === 'weg_ui_agrocaraya')) {
    flows.push({
        id: 'weg_ui_agrocaraya',
        type: 'ui_template',
        z: 'weg_flow_tab',
        group: 'weg_ui_grp_agrocaraya',
        name: 'Agrocaraya Dashboard',
        order: 1,
        width: '24',
        height: '12',
        format: `
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
.AG{font-family:'Inter',sans-serif;color:#1a1a2e;padding:16px;max-width:800px;margin:0 auto}
.AG *{box-sizing:border-box}
.AG .mono{font-family:'JetBrains Mono',monospace}
.AG-top{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.AG-logo{font-size:22px;font-weight:800;color:#1a1a2e}
.AG-sub{font-size:12px;color:#999}
.AG-sec{font-size:13px;font-weight:700;color:#1a1a2e;letter-spacing:1px;text-transform:uppercase;
  margin:16px 0 12px;padding-bottom:6px;border-bottom:2px solid #e8e8f0;display:flex;align-items:center;gap:8px}
.AG-sec-dot{width:4px;height:16px;border-radius:2px;background:#f59e0b}
.AG-card{background:white;border-radius:12px;border:1px solid #e8e8f0;overflow:hidden;
  box-shadow:0 1px 8px rgba(0,0,0,0.04);max-width:500px}
.AG-card-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #f0f0f5}
.AG-card-name{font-size:16px;font-weight:700}
.AG-badge{font-size:11px;padding:4px 12px;border-radius:6px;color:white;font-weight:700;background:#94a3b8}
.AG-placeholder{padding:30px;text-align:center;color:#bbb;font-size:14px}
.AG-placeholder svg{margin-bottom:10px}
</style>

<div class="AG">
  <div class="AG-top">
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div><div class="AG-logo">Agrocaraya</div><div class="AG-sub">Planta Agrocaraya — SSW900 Soft Starters</div></div>
  </div>

  <div class="AG-sec"><div class="AG-sec-dot"></div> SSW900 — Soft Starters</div>

  <div ng-repeat="d in msg.agrocaraya.sswDevices track by $index" class="AG-card" style="border-left:3px solid #94a3b8;opacity:0.6">
    <div class="AG-card-head">
      <span class="AG-card-name">{{d.name}}</span>
      <span class="AG-badge">RTU</span>
    </div>
    <div class="AG-placeholder">
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none"><path d="M12 9v2m0 4h.01M5.07 19h13.86c1.1 0 1.8-1.2 1.27-2.15L13.27 4.85c-.54-.95-1.99-.95-2.54 0L3.8 16.85C3.27 17.8 3.97 19 5.07 19z" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div>Sin datos — Modbus RTU</div>
      <div style="font-size:11px;color:#ddd;margin-top:4px">Requiere PLC M241 o gateway Modbus TCP</div>
    </div>
  </div>
</div>
`,
        storeOutMessages: false,
        fwdInMessages: false,
        resendOnRefresh: true,
        templateScope: 'local',
        x: 1100,
        y: 300,
        wires: [[]]
    });
    console.log('Created Agrocaraya template');
}

// ============================================================
// 4. UPDATE AGRIPLUS PAGE (Overview) with site header
// ============================================================
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.height = '30';
    uiOverview.storeOutMessages = false;
    uiOverview.fwdInMessages = false;
    uiOverview.format = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

.S{font-family:'Inter',sans-serif;color:#1a1a2e;padding:16px;max-width:1200px;margin:0 auto}
.S *{box-sizing:border-box}
.mono{font-family:'JetBrains Mono',monospace}

.S-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.S-logo{font-size:22px;font-weight:800;color:#1a1a2e;display:flex;align-items:center;gap:10px}
.S-logo svg{flex-shrink:0}
.S-subtitle{font-size:12px;color:#999;font-weight:400}
.S-stats{display:flex;gap:20px}
.S-stat{text-align:center;min-width:56px}
.S-stat-val{font-size:28px;font-weight:800;font-family:'JetBrains Mono',monospace;line-height:1}
.S-stat-lbl{font-size:10px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}

.S-ban{padding:12px 20px;border-radius:10px;text-align:center;font-size:15px;font-weight:700;color:white;
  letter-spacing:0.5px;margin-bottom:18px;font-family:'JetBrains Mono',monospace;
  box-shadow:0 2px 12px rgba(0,0,0,0.08)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
.S-ban-fault{animation:pulse 1.2s infinite}
.S-live{width:8px;height:8px;background:rgba(255,255,255,0.8);border-radius:50%;display:inline-block;
  animation:lp 2s infinite;margin-right:8px;vertical-align:middle}
@keyframes lp{0%,100%{opacity:1;box-shadow:0 0 8px rgba(255,255,255,0.5)}50%{opacity:.3;box-shadow:none}}

.S-sec{font-size:14px;font-weight:700;color:#1a1a2e;letter-spacing:1px;text-transform:uppercase;
  margin:22px 0 14px;padding-bottom:8px;border-bottom:2px solid #e8e8f0;display:flex;align-items:center;gap:8px}
.S-sec-dot{width:4px;height:18px;border-radius:2px}

.S-dgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.S-dgrid{grid-template-columns:1fr}}

.S-card{background:white;border-radius:14px;border:1px solid #e8e8f0;overflow:hidden;
  box-shadow:0 1px 8px rgba(0,0,0,0.04);transition:all .3s}
.S-card:hover{box-shadow:0 4px 24px rgba(0,0,0,0.08);transform:translateY(-1px)}
.S-card-off{opacity:0.45}

.S-card-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;
  border-bottom:1px solid #f0f0f5}
.S-card-name{font-size:18px;font-weight:700;color:#1a1a2e}
.S-card-ip{font-size:12px;color:#aaa;font-family:'JetBrains Mono',monospace;margin-left:10px}
.S-badge{font-size:12px;padding:5px 14px;border-radius:8px;color:white;font-weight:700;letter-spacing:0.5px}

.S-gauges{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;padding:18px 20px;background:#fafafd;
  border-bottom:1px solid #f0f0f5}
.S-gw{text-align:center}
.S-gl{font-size:11px;color:#888;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}

.S-card-body{padding:16px 20px}
.S-mcells{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.S-mc{background:#f8f8fc;border-radius:10px;padding:14px 16px;border-left:3px solid var(--ac,#ddd)}
.S-mc-l{font-size:11px;color:#888;font-weight:600;letter-spacing:0.5px;text-transform:uppercase}
.S-mc-v{font-size:26px;font-weight:700;font-family:'JetBrains Mono',monospace;margin-top:4px;color:#1a1a2e;
  transition:color .5s}
.S-mc-u{font-size:13px;color:#aaa;font-weight:400}

.S-footer{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;
  border-top:1px solid #f0f0f5;background:#fafafd;font-size:12px}
.S-footer-item{color:#bbb;font-family:'JetBrains Mono',monospace}
.S-footer-ok{color:#22c55e;font-weight:700;font-size:13px}
.S-footer-fault{color:#ef4444;font-weight:700;font-size:13px}

.S-fb{padding:12px 20px;font-size:14px;font-family:'JetBrains Mono',monospace;border-top:1px solid #f0f0f5}
.S-fb-fault{background:#fef2f2;color:#dc2626}
.S-fb-alarm{background:#fffbeb;color:#d97706}

.S-ssw-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.S-ssw-placeholder{padding:24px;text-align:center;color:#bbb;font-size:13px}
</style>

<div class="S">

<!-- TOP BAR -->
<div class="S-top">
  <div class="S-logo">
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" stroke="#16a34a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div>
      <div>Agriplus</div>
      <div class="S-subtitle">Planta Agriplus — WEG Drive Monitoring</div>
    </div>
  </div>
  <div class="S-stats">
    <div class="S-stat"><div class="S-stat-val" style="color:#3b82f6">{{msg.stats.running || 0}}</div><div class="S-stat-lbl">Running</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:#22c55e">{{msg.stats.total || 0}}</div><div class="S-stat-lbl">Online</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:{{msg.stats.faults>0?'#ef4444':'#ddd'}}">{{msg.stats.faults || 0}}</div><div class="S-stat-lbl">Faults</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:{{msg.stats.offline>0?'#94a3b8':'#ddd'}}">{{msg.stats.offline || 0}}</div><div class="S-stat-lbl">Offline</div></div>
  </div>
</div>

<!-- BANNER -->
<div class="S-ban" ng-style="{'background':msg.banner.color}" ng-class="{'S-ban-fault':msg.banner.hasFaults}">
  <span class="S-live"></span> {{msg.banner.text}}
</div>

<!-- CFW900 SECTION -->
<div class="S-sec"><div class="S-sec-dot" style="background:#3b82f6"></div> CFW900 — Variable Frequency Drives</div>
<div class="S-dgrid">
  <div ng-repeat="d in msg.cfwDevices track by $index" class="S-card" ng-class="{'S-card-off': !d.online}"
       style="border-left:4px solid {{d.online ? d.statusColor : '#e2e8f0'}}">

    <div class="S-card-head">
      <div><span class="S-card-name">{{d.name}}</span><span class="S-card-ip">{{d.ip}}</span></div>
      <span class="S-badge" style="background:{{d.online ? d.statusColor : '#94a3b8'}}">{{d.statusText}}</span>
    </div>

    <!-- Gauges (only show if online) -->
    <div class="S-gauges" ng-if="d.online">
      <div class="S-gw">
        <div class="S-gl">Velocidad</div>
        <svg viewBox="0 0 100 58" width="100" height="58">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="7" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.speedRef>0?d.motorSpeed/d.speedRef:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.speedRef>0?d.motorSpeed/d.speedRef:0),1))}}" fill="none" stroke="#3b82f6" stroke-width="7" stroke-linecap="round"/>
          <text x="50" y="44" text-anchor="middle" fill="#1a1a2e" font-size="18" font-family="JetBrains Mono" font-weight="700">{{d.motorSpeed}}</text>
          <text x="50" y="55" text-anchor="middle" fill="#999" font-size="9" font-family="JetBrains Mono">RPM</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">Corriente</div>
        <svg viewBox="0 0 100 58" width="100" height="58">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="7" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.nominalCurrent>0?d.current/d.nominalCurrent:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.nominalCurrent>0?d.current/d.nominalCurrent:0),1))}}" fill="none" stroke="#06b6d4" stroke-width="7" stroke-linecap="round"/>
          <text x="50" y="44" text-anchor="middle" fill="#1a1a2e" font-size="18" font-family="JetBrains Mono" font-weight="700">{{d.current.toFixed(1)}}</text>
          <text x="50" y="55" text-anchor="middle" fill="#999" font-size="9" font-family="JetBrains Mono">AMP</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">Tension</div>
        <svg viewBox="0 0 100 58" width="100" height="58">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="7" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.nominalVoltage>0?d.outputVoltage/d.nominalVoltage:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.nominalVoltage>0?d.outputVoltage/d.nominalVoltage:0),1))}}" fill="none" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/>
          <text x="50" y="44" text-anchor="middle" fill="#b45309" font-size="18" font-family="JetBrains Mono" font-weight="700">{{d.outputVoltage}}</text>
          <text x="50" y="55" text-anchor="middle" fill="#999" font-size="9" font-family="JetBrains Mono">VOLT</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">Frecuencia</div>
        <svg viewBox="0 0 100 58" width="100" height="58">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="7" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.nominalFreq>0?d.frequency/d.nominalFreq:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.nominalFreq>0?d.frequency/d.nominalFreq:0),1))}}" fill="none" stroke="#22c55e" stroke-width="7" stroke-linecap="round"/>
          <text x="50" y="44" text-anchor="middle" fill="#1a1a2e" font-size="18" font-family="JetBrains Mono" font-weight="700">{{d.frequency.toFixed(1)}}</text>
          <text x="50" y="55" text-anchor="middle" fill="#999" font-size="9" font-family="JetBrains Mono">Hz</text>
        </svg>
      </div>
    </div>

    <!-- Offline placeholder -->
    <div ng-if="!d.online" style="padding:24px;text-align:center;color:#ccc;background:#fafafd;border-bottom:1px solid #f0f0f5">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" style="margin-bottom:6px"><path d="M18.36 6.64a9 9 0 11-12.73 0" stroke="#ddd" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="2" x2="12" y2="12" stroke="#ddd" stroke-width="1.5" stroke-linecap="round"/></svg>
      <div style="font-size:13px">Drive offline</div>
    </div>

    <!-- Data cells (only if online) -->
    <div class="S-card-body" ng-if="d.online">
      <div class="S-mcells">
        <div class="S-mc" style="--ac:#f59e0b"><div class="S-mc-l">Potencia</div><div class="S-mc-v">{{d.power.toFixed(2)}} <span class="S-mc-u">kW</span></div></div>
        <div class="S-mc" style="--ac:#8b5cf6"><div class="S-mc-l">Cos &phi;</div><div class="S-mc-v">{{d.cosPhi.toFixed(2)}}</div></div>
        <div class="S-mc" style="--ac:{{d.motorTemp>100?'#ef4444':d.motorTemp>60?'#f59e0b':'#22c55e'}}">
          <div class="S-mc-l">Temp. Motor</div>
          <div class="S-mc-v" style="color:{{d.motorTemp>100?'#ef4444':d.motorTemp>60?'#f59e0b':'#22c55e'}}">{{d.motorTemp.toFixed(1)}} <span class="S-mc-u">&deg;C</span></div></div>
      </div>
    </div>

    <!-- Footer -->
    <div class="S-footer" ng-if="d.online">
      <span class="S-footer-item">{{d.hoursEnergized}}h encendido</span>
      <span class="S-footer-item">{{d.hoursEnabled}}h habilitado</span>
      <span ng-class="{'S-footer-ok':!d.hasFault,'S-footer-fault':d.hasFault}">{{d.hasFault ? d.faultText : 'Sin Falla'}}</span>
    </div>

    <div ng-if="d.hasFault" class="S-fb S-fb-fault">⚠ Protecciones: P1={{d.fault1}} P2={{d.fault2}} P3={{d.fault3}}</div>
    <div ng-if="d.hasAlarm && !d.hasFault" class="S-fb S-fb-alarm">⚠ Alarma: {{d.alarm1}}</div>
  </div>
</div>

<!-- SSW900 AGRIPLUS (2 units) -->
<div class="S-sec"><div class="S-sec-dot" style="background:#f59e0b"></div> SSW900 — Soft Starters</div>
<div class="S-ssw-grid">
  <div ng-repeat="d in msg.agriplus.sswDevices track by $index" class="S-card S-card-off" style="border-left:4px solid #e2e8f0">
    <div class="S-card-head">
      <span class="S-card-name">{{d.name}}</span>
      <span class="S-badge" style="background:#94a3b8">RTU</span>
    </div>
    <div class="S-ssw-placeholder">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none"><path d="M12 9v2m0 4h.01M5.07 19h13.86c1.1 0 1.8-1.2 1.27-2.15L13.27 4.85c-.54-.95-1.99-.95-2.54 0L3.8 16.85C3.27 17.8 3.97 19 5.07 19z" stroke="#ccc" stroke-width="1.5"/></svg>
      <div>Pendiente conexion TCP</div>
    </div>
  </div>
</div>

</div>
`;
    console.log('Updated Agriplus page');
}

// ============================================================
// 5. MOVE TRENDING AND VOLTAGE TABS AFTER AGROCARAYA
// ============================================================
const tabTrending = flows.find(n => n.id === 'weg_ui_tab_trending');
if (tabTrending) { tabTrending.order = 3; }

const tabVoltage = flows.find(n => n.id === 'weg_ui_tab_voltage');
if (tabVoltage) { tabVoltage.order = 4; }

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('All site split updates saved.');
