const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.height = "22";
    uiOverview.format = `
<style>
/* === SCADA INDUSTRIAL THEME === */
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

.scada{font-family:'Rajdhani',sans-serif;max-width:1000px;margin:0 auto;color:#e0e0e0}
.scada *{box-sizing:border-box}

/* Banner */
.s-banner{padding:10px 20px;border-radius:4px;text-align:center;font-size:14px;font-weight:600;color:white;
  letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;
  box-shadow:0 2px 10px rgba(0,0,0,0.3)}
.s-banner-run{background:linear-gradient(135deg,#0052a3,#0078d4)}
.s-banner-ready{background:linear-gradient(135deg,#1a7a1a,#28a428)}
.s-banner-fault{background:linear-gradient(135deg,#a00,#d00);animation:pulse 1.5s infinite}
.s-banner-off{background:linear-gradient(135deg,#555,#777)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}

/* Header bar */
.s-header{display:flex;justify-content:space-between;align-items:center;background:#1a1a2e;
  border-radius:6px 6px 0 0;padding:10px 16px;border-bottom:2px solid #333}
.s-title{font-size:18px;font-weight:700;letter-spacing:1px}
.s-status-badge{font-size:11px;padding:4px 12px;border-radius:3px;color:white;font-weight:600;letter-spacing:1px}

/* Main card */
.s-card{background:#12121f;border-radius:6px;overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.4);border:1px solid #2a2a3e}

/* Sections */
.s-section{padding:14px 16px;border-bottom:1px solid #1e1e30}
.s-section:last-child{border-bottom:none}
.s-sec-title{font-size:11px;font-weight:600;color:#FFD700;letter-spacing:2px;text-transform:uppercase;
  margin-bottom:10px;display:flex;align-items:center;gap:6px}
.s-sec-title::before{content:'';width:3px;height:12px;background:#FFD700;border-radius:2px}

/* Grid */
.s-grid{display:grid;gap:10px}
.s-g3{grid-template-columns:1fr 1fr 1fr}
.s-g4{grid-template-columns:1fr 1fr 1fr 1fr}

/* Value cell */
.s-cell{background:#0d0d1a;border-radius:4px;padding:10px 12px;border:1px solid #1e1e30;position:relative;overflow:hidden}
.s-cell::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,#333)}
.s-label{font-size:9px;color:#888;letter-spacing:1.5px;text-transform:uppercase;font-family:'Share Tech Mono',monospace}
.s-value{font-size:28px;font-weight:700;font-family:'Share Tech Mono',monospace;margin:2px 0;line-height:1.1}
.s-unit{font-size:12px;color:#666;font-weight:400}
.s-sub{font-size:9px;color:#555;font-family:'Share Tech Mono',monospace}

/* Progress bar */
.s-pbar{height:4px;background:#1a1a2e;border-radius:2px;margin-top:4px;overflow:hidden}
.s-pfill{height:100%;border-radius:2px;transition:width 0.8s ease}

/* Gauge SVG */
.s-gauge-wrap{display:flex;flex-direction:column;align-items:center;padding:8px}
.s-gauge-label{font-size:9px;color:#888;letter-spacing:1.5px;text-transform:uppercase;font-family:'Share Tech Mono',monospace;margin-bottom:4px}
.s-gauge-val{font-size:14px;font-weight:700;font-family:'Share Tech Mono',monospace;margin-top:-2px}

/* Fault/Alarm boxes */
.s-fault{background:rgba(200,0,0,0.15);border:1px solid #660000;border-radius:4px;padding:8px 12px;
  color:#ff6666;font-size:12px;font-family:'Share Tech Mono',monospace;margin-top:8px;
  display:flex;align-items:center;gap:8px}
.s-alarm{background:rgba(200,180,0,0.1);border:1px solid #665500;border-radius:4px;padding:6px 12px;
  color:#ffcc44;font-size:11px;font-family:'Share Tech Mono',monospace;margin-top:4px}
.s-ok{color:#00ff88;font-family:'Share Tech Mono',monospace}

/* Live indicator */
.s-live{width:6px;height:6px;background:#00ff88;border-radius:50%;display:inline-block;
  animation:livepulse 2s infinite;margin-right:6px}
@keyframes livepulse{0%,100%{opacity:1;box-shadow:0 0 4px #00ff88}50%{opacity:0.4;box-shadow:none}}

/* Temp color */
.temp-cold{color:#44aaff}.temp-ok{color:#00ff88}.temp-warn{color:#FFD700}.temp-hot{color:#ff4444}
</style>

<div class="scada" ng-init="
  gaugeArc = function(pct, r) {
    var a = Math.PI * (1 + pct/100);
    var x = 50 + r * Math.cos(a);
    var y = 50 + r * Math.sin(a);
    var large = pct > 50 ? 1 : 0;
    return 'M ' + (50-r) + ' 50 A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x.toFixed(1) + ' ' + y.toFixed(1);
  }
">

<!-- BANNER -->
<div class="s-banner" ng-class="{
  's-banner-run': msg.cfwDevices[0].running,
  's-banner-ready': msg.cfwDevices[0].ready,
  's-banner-fault': msg.banner.hasFaults,
  's-banner-off': !msg.cfwDevices[0].running && !msg.cfwDevices[0].ready && !msg.banner.hasFaults
}">
  <span class="s-live"></span> {{msg.banner.text}}
</div>

<div ng-repeat="d in msg.cfwDevices" class="s-card">

  <!-- HEADER -->
  <div class="s-header">
    <div>
      <span class="s-title">{{d.name}}</span>
      <span style="color:#666;font-size:11px;margin-left:8px">192.168.10.100</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <span ng-if="d.hasAlarm" style="color:#FFD700;font-size:11px">⚠ {{d.alarmText}}</span>
      <span class="s-status-badge" style="background:{{d.statusColor}}">{{d.statusText}}</span>
    </div>
  </div>

  <!-- GAUGES ROW -->
  <div class="s-section" style="background:#0a0a18">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;text-align:center">

      <!-- Gauge: Speed -->
      <div class="s-gauge-wrap">
        <div class="s-gauge-label">Velocidad</div>
        <svg viewBox="0 0 100 60" width="120" height="72">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1a1a2e" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="{{gaugeArc(d.speedRef>0 ? d.motorSpeed/d.speedRef*100 : 0, 40)}}" fill="none" stroke="#0078d4" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="45" text-anchor="middle" fill="#e0e0e0" font-size="14" font-family="Share Tech Mono" font-weight="700">{{d.motorSpeed}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#666" font-size="7" font-family="Share Tech Mono">RPM</text>
        </svg>
        <div class="s-sub">Ref: {{d.speedRef}}</div>
      </div>

      <!-- Gauge: Current -->
      <div class="s-gauge-wrap">
        <div class="s-gauge-label">Corriente</div>
        <svg viewBox="0 0 100 60" width="120" height="72">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1a1a2e" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="{{gaugeArc(d.nominalCurrent>0 ? Math.min(d.current/d.nominalCurrent*100,100) : 0, 40)}}" fill="none" stroke="#00aaff" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="45" text-anchor="middle" fill="#e0e0e0" font-size="14" font-family="Share Tech Mono" font-weight="700">{{d.current.toFixed(1)}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#666" font-size="7" font-family="Share Tech Mono">A</text>
        </svg>
        <div class="s-sub">Nom: {{d.nominalCurrent.toFixed(0)}} A</div>
      </div>

      <!-- Gauge: Voltage -->
      <div class="s-gauge-wrap">
        <div class="s-gauge-label">Tension Salida</div>
        <svg viewBox="0 0 100 60" width="120" height="72">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1a1a2e" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="{{gaugeArc(d.nominalVoltage>0 ? Math.min(d.outputVoltage/d.nominalVoltage*100,100) : 0, 40)}}" fill="none" stroke="#FFD700" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="45" text-anchor="middle" fill="#FFD700" font-size="14" font-family="Share Tech Mono" font-weight="700">{{d.outputVoltage}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#666" font-size="7" font-family="Share Tech Mono">V</text>
        </svg>
        <div class="s-sub">Nom: {{d.nominalVoltage.toFixed(0)}} V</div>
      </div>

      <!-- Gauge: Frequency -->
      <div class="s-gauge-wrap">
        <div class="s-gauge-label">Frecuencia</div>
        <svg viewBox="0 0 100 60" width="120" height="72">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1a1a2e" stroke-width="6" stroke-linecap="round"/>
          <path ng-attr-d="{{gaugeArc(d.nominalFreq>0 ? Math.min(d.frequency/d.nominalFreq*100,100) : 0, 40)}}" fill="none" stroke="#00ff88" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="45" text-anchor="middle" fill="#e0e0e0" font-size="14" font-family="Share Tech Mono" font-weight="700">{{d.frequency.toFixed(1)}}</text>
          <text x="50" y="56" text-anchor="middle" fill="#666" font-size="7" font-family="Share Tech Mono">Hz</text>
        </svg>
        <div class="s-sub">Nom: {{d.nominalFreq.toFixed(0)}} Hz</div>
      </div>

    </div>
  </div>

  <!-- POWER & ELECTRICAL -->
  <div class="s-section">
    <div class="s-sec-title">Potencia y Electrica</div>
    <div class="s-grid s-g4">
      <div class="s-cell" style="--accent:#FFD700">
        <div class="s-label">Potencia Activa</div>
        <div class="s-value" style="font-size:24px">{{d.power.toFixed(2)}} <span class="s-unit">kW</span></div>
      </div>
      <div class="s-cell" style="--accent:#00aaff">
        <div class="s-label">Cos φ</div>
        <div class="s-value" style="font-size:24px">{{d.cosPhi.toFixed(2)}}</div>
      </div>
      <div class="s-cell" style="--accent:#C88200">
        <div class="s-label">Torque Motor</div>
        <div class="s-value" style="font-size:24px">{{d.motorTorque.toFixed(1)}} <span class="s-unit">%</span></div>
        <div class="s-pbar"><div class="s-pfill" style="width:{{Math.min(Math.abs(d.motorTorque),100)}}%;background:#C88200"></div></div>
      </div>
      <div class="s-cell" style="--accent:{{d.motorTemp>120?'#ff4444':d.motorTemp>80?'#FFD700':'#00ff88'}}">
        <div class="s-label">Temp. Motor</div>
        <div class="s-value" style="font-size:24px" ng-class="{'temp-cold':d.motorTemp<=30,'temp-ok':d.motorTemp>30&&d.motorTemp<=80,'temp-warn':d.motorTemp>80&&d.motorTemp<=120,'temp-hot':d.motorTemp>120}">
          {{d.motorTemp.toFixed(1)}} <span class="s-unit">°C</span>
        </div>
      </div>
    </div>
  </div>

  <!-- OPERATION -->
  <div class="s-section">
    <div class="s-sec-title">Operacion</div>
    <div class="s-grid s-g3">
      <div class="s-cell" style="--accent:#555">
        <div class="s-label">Horas Energizado</div>
        <div class="s-value" style="font-size:22px">{{d.hoursEnergized}} <span class="s-unit">h</span></div>
        <div class="s-sub">{{d.secondsEnergized}} seg</div>
      </div>
      <div class="s-cell" style="--accent:#555">
        <div class="s-label">Horas Habilitado</div>
        <div class="s-value" style="font-size:22px">{{d.hoursEnabled}} <span class="s-unit">h</span></div>
        <div class="s-sub">{{d.secondsEnabled}} seg</div>
      </div>
      <div class="s-cell" style="--accent:{{d.hasFault?'#ff4444':'#00ff88'}}">
        <div class="s-label">Estado de Proteccion</div>
        <div ng-if="!d.hasFault" class="s-ok" style="font-size:16px;margin-top:4px">● SIN FALLA</div>
        <div ng-if="d.hasFault" style="color:#ff4444;font-size:14px;font-family:'Share Tech Mono';margin-top:4px">● {{d.faultText}}</div>
      </div>
    </div>
  </div>

  <!-- FAULT/ALARM DETAIL -->
  <div class="s-section" ng-if="d.hasFault" style="padding:8px 16px">
    <div class="s-fault">
      <span style="font-size:18px">⚠</span>
      <div>
        <div style="font-weight:700">PROTECCION ACTIVA</div>
        <div>P1: {{d.fault1}} | P2: {{d.fault2}} | P3: {{d.fault3}} | P4: {{d.fault4}} | P5: {{d.fault5}}</div>
      </div>
    </div>
  </div>
  <div class="s-section" ng-if="d.hasAlarm" style="padding:4px 16px 8px">
    <div class="s-alarm">
      ⚠ ALARMAS: A1={{d.alarm1}} A2={{d.alarm2}} A3={{d.alarm3}} A4={{d.alarm4}} A5={{d.alarm5}}
    </div>
  </div>

</div>
</div>
`;
    console.log('Updated dashboard to industrial SCADA style');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved. Restart to apply.');
