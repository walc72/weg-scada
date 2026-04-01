const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.height = "30";
    uiOverview.storeOutMessages = false;
    uiOverview.fwdInMessages = false;
    uiOverview.format = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

.S{font-family:'Inter',sans-serif;color:#1a1a2e;padding:16px;max-width:1200px;margin:0 auto}
.S *{box-sizing:border-box}
.mono{font-family:'JetBrains Mono',monospace}

/* Top bar */
.S-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.S-logo{font-size:22px;font-weight:800;color:#1a1a2e;display:flex;align-items:center;gap:8px}
.S-logo svg{width:28px;height:28px}
.S-subtitle{font-size:12px;color:#999;font-weight:400;margin-left:4px}
.S-stats{display:flex;gap:20px}
.S-stat{text-align:center;min-width:56px}
.S-stat-val{font-size:26px;font-weight:800;font-family:'JetBrains Mono',monospace;line-height:1}
.S-stat-lbl{font-size:10px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}

/* Banner */
.S-ban{padding:12px 20px;border-radius:10px;text-align:center;font-size:15px;font-weight:700;color:white;
  letter-spacing:0.5px;margin-bottom:16px;font-family:'JetBrains Mono',monospace;
  box-shadow:0 2px 12px rgba(0,0,0,0.1)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
.S-ban-fault{animation:pulse 1.2s infinite}

/* Live dot */
.S-live{width:8px;height:8px;background:white;border-radius:50%;display:inline-block;
  animation:lp 2s infinite;margin-right:8px;vertical-align:middle}
@keyframes lp{0%,100%{opacity:1;box-shadow:0 0 8px rgba(255,255,255,0.6)}50%{opacity:.3;box-shadow:none}}

/* Section title */
.S-sec{font-size:13px;font-weight:700;color:#1a1a2e;letter-spacing:1px;text-transform:uppercase;
  margin:20px 0 12px;padding-bottom:6px;border-bottom:2px solid #e8e8f0;display:flex;align-items:center;gap:8px}
.S-sec-dot{width:4px;height:16px;border-radius:2px}

/* Drive grid */
.S-dgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:900px){.S-dgrid{grid-template-columns:1fr}}

/* Drive card */
.S-card{background:white;border-radius:12px;border:1px solid #e8e8f0;overflow:hidden;
  box-shadow:0 1px 8px rgba(0,0,0,0.04);transition:all .3s}
.S-card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.08);transform:translateY(-1px)}

.S-card-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;
  border-bottom:1px solid #f0f0f5}
.S-card-name{font-size:16px;font-weight:700;color:#1a1a2e}
.S-card-ip{font-size:11px;color:#aaa;font-family:'JetBrains Mono',monospace;margin-left:8px}
.S-badge{font-size:11px;padding:4px 12px;border-radius:6px;color:white;font-weight:700;letter-spacing:0.5px}

/* Gauge row */
.S-gauges{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;padding:16px 18px;background:#fafafd;
  border-bottom:1px solid #f0f0f5}
.S-gw{text-align:center}
.S-gl{font-size:10px;color:#999;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}

/* Data cells */
.S-card-body{padding:14px 18px}
.S-mcells{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.S-mc{background:#f8f8fc;border-radius:8px;padding:10px 14px;border-left:3px solid var(--ac,#ddd)}
.S-mc-l{font-size:10px;color:#999;font-weight:600;letter-spacing:0.5px;text-transform:uppercase}
.S-mc-v{font-size:22px;font-weight:700;font-family:'JetBrains Mono',monospace;margin-top:2px;color:#1a1a2e}
.S-mc-u{font-size:11px;color:#aaa;font-weight:400}

/* Footer row */
.S-footer{display:flex;justify-content:space-between;align-items:center;padding:8px 18px;
  border-top:1px solid #f0f0f5;background:#fafafd}
.S-footer-item{font-size:11px;color:#bbb;font-family:'JetBrains Mono',monospace}
.S-footer-ok{color:#22c55e;font-weight:600}
.S-footer-fault{color:#ef4444;font-weight:600}

/* Fault/alarm bars */
.S-fb{padding:10px 18px;font-size:13px;font-family:'JetBrains Mono',monospace;border-top:1px solid #f0f0f5}
.S-fb-fault{background:#fef2f2;color:#dc2626}
.S-fb-alarm{background:#fffbeb;color:#d97706}

/* Offline card */
.S-offline{opacity:0.5}

/* SSW grid */
.S-dgrid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
@media(max-width:900px){.S-dgrid3{grid-template-columns:1fr}}

.S-ssw-placeholder{padding:20px 18px;text-align:center;color:#ccc;font-size:13px}
</style>

<div class="S">

<!-- TOP BAR -->
<div class="S-top">
  <div class="S-logo">
    <svg viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"/></svg>
    WEG SCADA <span class="S-subtitle">Drive Monitoring System</span>
  </div>
  <div class="S-stats">
    <div class="S-stat"><div class="S-stat-val" style="color:#3b82f6">{{msg.stats.running || 0}}</div><div class="S-stat-lbl">Running</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:#22c55e">{{msg.stats.total || 0}}</div><div class="S-stat-lbl">Online</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:{{msg.stats.faults>0?'#ef4444':'#ddd'}}">{{msg.stats.faults || 0}}</div><div class="S-stat-lbl">Faults</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:{{msg.stats.offline>0?'#999':'#ddd'}}">{{msg.stats.offline || 0}}</div><div class="S-stat-lbl">Offline</div></div>
  </div>
</div>

<!-- BANNER -->
<div class="S-ban" ng-style="{'background':msg.banner.color}" ng-class="{'S-ban-fault':msg.banner.hasFaults}">
  <span class="S-live"></span> {{msg.banner.text}}
</div>

<!-- CFW900 SECTION -->
<div class="S-sec"><div class="S-sec-dot" style="background:#3b82f6"></div> CFW900 — Variable Frequency Drives</div>
<div class="S-dgrid">
  <div ng-repeat="d in msg.cfwDevices track by $index" class="S-card" ng-class="{'S-offline': !d.online}">

    <!-- Header -->
    <div class="S-card-head">
      <div><span class="S-card-name">{{d.name}}</span><span class="S-card-ip">{{d.ip}}</span></div>
      <span class="S-badge" style="background:{{d.online ? d.statusColor : '#bbb'}}">{{d.statusText}}</span>
    </div>

    <!-- Gauges -->
    <div class="S-gauges">
      <div class="S-gw">
        <div class="S-gl">Velocidad</div>
        <svg viewBox="0 0 100 58" width="90" height="52">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.speedRef>0?d.motorSpeed/d.speedRef:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.speedRef>0?d.motorSpeed/d.speedRef:0),1))}}" fill="none" stroke="#3b82f6" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#1a1a2e" font-size="16" font-family="JetBrains Mono" font-weight="700">{{d.motorSpeed}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#999" font-size="8" font-family="JetBrains Mono">RPM</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">Corriente</div>
        <svg viewBox="0 0 100 58" width="90" height="52">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.nominalCurrent>0?d.current/d.nominalCurrent:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.nominalCurrent>0?d.current/d.nominalCurrent:0),1))}}" fill="none" stroke="#06b6d4" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#1a1a2e" font-size="16" font-family="JetBrains Mono" font-weight="700">{{d.current.toFixed(1)}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#999" font-size="8" font-family="JetBrains Mono">A</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">Tension</div>
        <svg viewBox="0 0 100 58" width="90" height="52">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.nominalVoltage>0?d.outputVoltage/d.nominalVoltage:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.nominalVoltage>0?d.outputVoltage/d.nominalVoltage:0),1))}}" fill="none" stroke="#f59e0b" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#b45309" font-size="16" font-family="JetBrains Mono" font-weight="700">{{d.outputVoltage}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#999" font-size="8" font-family="JetBrains Mono">V</text>
        </svg>
      </div>
      <div class="S-gw">
        <div class="S-gl">Frecuencia</div>
        <svg viewBox="0 0 100 58" width="90" height="52">
          <path d="M 10 52 A 40 40 0 0 1 90 52" fill="none" stroke="#e8e8f0" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="M 10 52 A 40 40 0 0 1 {{10+80*Math.min((d.nominalFreq>0?d.frequency/d.nominalFreq:0),1)}} {{52-40*Math.sin(Math.PI*Math.min((d.nominalFreq>0?d.frequency/d.nominalFreq:0),1))}}" fill="none" stroke="#22c55e" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="46" text-anchor="middle" fill="#1a1a2e" font-size="16" font-family="JetBrains Mono" font-weight="700">{{d.frequency.toFixed(1)}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#999" font-size="8" font-family="JetBrains Mono">Hz</text>
        </svg>
      </div>
    </div>

    <!-- Data cells -->
    <div class="S-card-body">
      <div class="S-mcells">
        <div class="S-mc" style="--ac:#f59e0b">
          <div class="S-mc-l">Potencia</div>
          <div class="S-mc-v">{{d.power.toFixed(2)}} <span class="S-mc-u">kW</span></div>
        </div>
        <div class="S-mc" style="--ac:#8b5cf6">
          <div class="S-mc-l">Cos phi</div>
          <div class="S-mc-v">{{d.cosPhi.toFixed(2)}}</div>
        </div>
        <div class="S-mc" style="--ac:{{d.motorTemp>100?'#ef4444':d.motorTemp>60?'#f59e0b':'#22c55e'}}">
          <div class="S-mc-l">Temp. Motor</div>
          <div class="S-mc-v" style="color:{{d.motorTemp>100?'#ef4444':d.motorTemp>60?'#f59e0b':'#22c55e'}}">{{d.motorTemp.toFixed(1)}} <span class="S-mc-u">&deg;C</span></div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="S-footer">
      <span class="S-footer-item">{{d.hoursEnergized}}h encendido</span>
      <span class="S-footer-item">{{d.hoursEnabled}}h habilitado</span>
      <span ng-class="{'S-footer-ok':!d.hasFault, 'S-footer-fault':d.hasFault}">
        {{d.hasFault ? d.faultText : 'Sin Falla'}}
      </span>
    </div>

    <!-- Fault bar -->
    <div ng-if="d.hasFault" class="S-fb S-fb-fault">
      ⚠ Protecciones: P1={{d.fault1}} P2={{d.fault2}} P3={{d.fault3}} P4={{d.fault4}} P5={{d.fault5}}
    </div>
    <div ng-if="d.hasAlarm && !d.hasFault" class="S-fb S-fb-alarm">
      ⚠ Alarma: {{d.alarm1}}
    </div>

  </div>
</div>

<!-- SSW900 SECTION -->
<div class="S-sec"><div class="S-sec-dot" style="background:#f59e0b"></div> SSW900 — Soft Starters <span style="color:#bbb;font-size:10px;font-weight:400;margin-left:8px">(Modbus RTU — Pendiente conexion TCP)</span></div>
<div class="S-dgrid3">
  <div ng-repeat="d in msg.sswDevices track by $index" class="S-card S-offline">
    <div class="S-card-head">
      <div><span class="S-card-name">{{d.name}}</span><span class="S-card-ip">{{d.ip}}</span></div>
      <span class="S-badge" style="background:#bbb">RTU</span>
    </div>
    <div class="S-ssw-placeholder">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" style="margin-bottom:8px"><path d="M12 9v2m0 4h.01M5.07 19h13.86c1.1 0 1.8-1.2 1.27-2.15L13.27 4.85c-.54-.95-1.99-.95-2.54 0L3.8 16.85C3.27 17.8 3.97 19 5.07 19z" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div>Sin datos — Requiere PLC M241 o gateway TCP</div>
    </div>
  </div>
</div>

</div>
`;
    console.log('Applied light industrial theme');
}

// Also update the Node-RED dashboard theme to light
let uiBase = flows.find(n => n.type === 'ui_base');
if (uiBase) {
    uiBase.theme = {
        name: 'theme-light',
        lightTheme: {
            default: '#0094CE',
            baseColor: '#0094CE',
            baseFont: '-apple-system,BlinkMacSystemFont,Segoe UI,Inter,sans-serif',
            edited: true,
            reset: false
        },
        darkTheme: {},
        customTheme: {},
        themeState: { 'base-color': { default: '#0094CE', value: '#0094CE', edited: false } },
        angularTheme: { primary: 'indigo', accents: 'blue', warn: 'red', background: 'grey' }
    };
    console.log('Set dashboard to light theme');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved. Restart to apply.');
