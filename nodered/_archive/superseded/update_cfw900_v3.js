const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// 1. Update Modbus read: need regs 0-70 + 365
// We'll do two reads: 0-70 and 365-366
const readCFW = flows.find(n => n.id === 'weg_read_cfw');
if (readCFW) {
    readCFW.name = 'Read CFW900 #1 Main (Reg 0-70)';
    readCFW.adr = '0';
    readCFW.quantity = '71';
    console.log('Updated main read: regs 0-70');
}

// Repurpose SSW read for the second register block (temp sensor)
const readSSW = flows.find(n => n.id === 'weg_read_ssw');
if (readSSW) {
    readSSW.name = 'Read CFW900 #1 Temp (Reg 365)';
    readSSW.adr = '365';
    readSSW.quantity = '1';
    readSSW.rate = '5';
    readSSW.rateUnit = 's';
    readSSW.server = 'weg_modbus_config';
    console.log('Updated temp read: reg 365 every 5s');
}

// 2. Update parser for real CFW900 register map
const parseCFW = flows.find(n => n.id === 'weg_parse_cfw');
if (parseCFW) {
    parseCFW.func = `
// =============================================
// CFW900 NATIVE REGISTER MAP (from WEG manual)
// =============================================
const regs = msg.payload;

const device = {
    name: 'CFW900 #1',

    // Reg 6: Estado CFW (0=Pronto,1=Ejecucion,2=Subtension,3=Proteccion,4=Config,5=STO,6=PotApagada,7=Deshabilitado)
    stateCode: regs[6],

    // Reg 1: Velocidad de Referencia (RPM, sin decimales)
    speedRef: regs[1],

    // Reg 2: Velocidad Actual (RPM, sin decimales)
    motorSpeed: regs[2],

    // Reg 3: Corriente de Salida (A, 1 decimal -> /10)
    outputCurrent: regs[3] / 10.0,

    // Reg 5: Frecuencia de Salida (Hz, 1 decimal -> /10)
    outputFreq: regs[5] / 10.0,

    // Reg 7: Tension de Salida (V, sin decimales)
    outputVoltage: regs[7],

    // Reg 10: Potencia de Salida (kW, 2 decimales -> /100)
    outputPower: regs[10] / 100.0,

    // Reg 11: Cos phi (2 decimales, signed -> /100)
    cosPhi: (regs[11] > 32767 ? regs[11] - 65536 : regs[11]) / 100.0,

    // Reg 42: Horas Energizado
    hoursEnergized: regs[42],

    // Reg 46: Horas Habilitado
    hoursEnabled: regs[46],

    // Reg 50-54: Alarmas
    alarm1: regs[50], alarm2: regs[51], alarm3: regs[52], alarm4: regs[53], alarm5: regs[54],

    // Reg 60-64: Protecciones (fallas)
    fault1: regs[60], fault2: regs[61], fault3: regs[62], fault4: regs[63], fault5: regs[64],

    // Motor temp from second read (stored in flow)
    motorTemp: flow.get('cfwMotorTemp') || 0,

    online: true,
    commErrors: 0,
};

// Aliases for dashboard
device.speedRPM = device.motorSpeed;
device.current = device.outputCurrent;
device.frequency = device.outputFreq;
device.voltage = device.outputVoltage;
device.power = device.outputPower;
device.faultCode = device.fault1;

// State decode
const stateNames = {
    0: 'READY', 1: 'RUNNING', 2: 'UNDERVOLTAGE', 3: 'PROTECTION',
    4: 'CONFIG', 5: 'STO', 6: 'POWER OFF', 7: 'DISABLED', 8: 'SS1', 9: 'AUTOTUNE'
};
const stateColors = {
    0: '#00B400', 1: '#0064DC', 2: '#C88200', 3: '#DC0000',
    4: '#888888', 5: '#FF6600', 6: '#666666', 7: '#999999', 8: '#FF6600', 9: '#00AAAA'
};

device.statusText = stateNames[device.stateCode] || 'UNKNOWN';
device.statusColor = stateColors[device.stateCode] || '#808080';
device.running = device.stateCode === 1;
device.ready = device.stateCode === 0;
device.fault = device.stateCode === 3;

// Has any active alarm?
device.hasAlarm = (device.alarm1 > 0 || device.alarm2 > 0);
device.hasFault = (device.fault1 > 0);

// Fault text
const faultTexts = {
    0:'No Fault', 1:'F001: Sobrecorriente', 2:'F002: Sobretension', 3:'F003: Falla a tierra',
    4:'F004: Sobretemperatura IGBT', 5:'F005: Sobrecarga motor', 6:'F006: Sobretemperatura drive',
    7:'F007: Subtension DC', 8:'F008: Falla comunicacion', 12:'F012: Perdida de fase',
    21:'F021: Falla tierra', 33:'F033: Subtension', 49:'F049: Motor bloqueado',
    70:'F070: Error comunicacion', 72:'F072: Timeout fieldbus'
};
device.faultText = faultTexts[device.fault1] || (device.fault1 > 0 ? 'Proteccion: ' + device.fault1 : 'Sin Falla');

// Alarm text
const alarmTexts = {
    0:'Sin Alarma', 24:'A024: Sobretemperatura motor', 25:'A025: Motor PTC',
    70:'A070: Comm warning'
};
device.alarmText = alarmTexts[device.alarm1] || (device.alarm1 > 0 ? 'Alarma: ' + device.alarm1 : 'Sin Alarma');

const devices = [device];
flow.set('cfwDevices', devices);
flow.set('sswDevices', []);
msg.cfwDevices = devices;
return msg;
`;
    console.log('Updated parser v3 with real register map');
}

// 3. Update SSW parser to store motor temp
const parseSSW = flows.find(n => n.id === 'weg_parse_ssw');
if (parseSSW) {
    parseSSW.func = `
// Store motor temperature from reg 365 (signed, 1 decimal)
const regs = msg.payload;
let temp = regs[0];
if (temp > 32767) temp = temp - 65536;
flow.set('cfwMotorTemp', temp / 10.0);
return null;
`;
    console.log('Updated SSW parser -> motor temp storage');
}

// 4. Update combine+banner
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.func = `
const cfwDevices = flow.get('cfwDevices') || [];
const faults = [];
cfwDevices.forEach(d => {
    if (d.fault || d.hasFault) faults.push(d.name + ': ' + d.faultText);
});

let banner;
if (faults.length === 0) {
    const d = cfwDevices[0];
    if (d && d.running) {
        banner = { text: d.name + ' — RUNNING | ' + d.speedRPM + ' RPM | ' + d.current.toFixed(1) + ' A | ' + d.frequency.toFixed(1) + ' Hz', color: '#0064DC', hasFaults: false };
    } else if (d) {
        banner = { text: d.name + ' — ' + d.statusText, color: d.statusColor, hasFaults: false };
    } else {
        banner = { text: 'Waiting for data...', color: '#888', hasFaults: false };
    }
} else {
    banner = { text: faults.join(' | '), color: '#DC0000', hasFaults: true, faultCount: faults.length };
}

msg.cfwDevices = cfwDevices;
msg.sswDevices = [];
msg.banner = banner;
return msg;
`;
    console.log('Updated banner v3');
}

// 5. Update dashboard template
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.format = `<style>
.wb{padding:12px 16px;border-radius:6px;text-align:center;font-weight:bold;font-size:15px;color:white;margin-bottom:12px}
.wc{background:#1e1e1e;border-radius:8px;padding:16px;color:white;max-width:950px;margin:0 auto}
.wv{font-size:26px;font-weight:bold;margin:4px 0}
.wl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px}
.wbar{background:#333;border-radius:3px;height:6px;margin:4px 0}
.wbf{height:100%;border-radius:3px;transition:width .5s}
.ws{font-size:12px;padding:3px 10px;border-radius:4px;display:inline-block;color:white;margin-left:8px}
.wfb{margin-top:10px;padding:8px 12px;background:#3a0000;border-radius:4px;color:#ff6666;font-size:13px}
.wab{margin-top:6px;padding:6px 12px;background:#3a3a00;border-radius:4px;color:#ffcc44;font-size:12px}
.wsec{color:#FFD700;font-size:13px;font-weight:bold;margin:14px 0 8px 0;border-bottom:1px solid #333;padding-bottom:4px}
.wgrid{display:grid;gap:12px}
.g3{grid-template-columns:1fr 1fr 1fr}
.g4{grid-template-columns:1fr 1fr 1fr 1fr}
.g2{grid-template-columns:1fr 1fr}
@keyframes bl{50%{opacity:.5}}
.fault-blink{animation:bl 1s infinite}
</style>

<div class="wb" ng-style="{'background': msg.banner.color}" ng-class="{'fault-blink':msg.banner.hasFaults}">
  {{msg.banner.text}}
</div>

<div ng-repeat="d in msg.cfwDevices" class="wc" style="border-left:5px solid {{d.statusColor}}">
  <div style="font-size:16px;font-weight:bold;color:#ccc">
    {{d.name}} <span class="ws" style="background:{{d.statusColor}}">{{d.statusText}}</span>
    <span ng-if="d.hasAlarm" style="color:#FFD700;font-size:12px;margin-left:8px">⚠ {{d.alarmText}}</span>
  </div>

  <div class="wsec">Motor</div>
  <div class="wgrid g3">
    <div><div class="wl">Velocidad Actual</div><div class="wv">{{d.motorSpeed}} <small>RPM</small></div>
      <div style="color:#666;font-size:10px">Ref: {{d.speedRef}} RPM</div></div>
    <div><div class="wl">Corriente de Salida</div><div class="wv">{{d.current.toFixed(1)}} <small>A</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.current/100*100,100).toFixed(0)}}%;background:#0064DC"></div></div></div>
    <div><div class="wl">Frecuencia de Salida</div><div class="wv">{{d.frequency.toFixed(1)}} <small>Hz</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.frequency/60*100,100).toFixed(0)}}%;background:#00B400"></div></div></div>
  </div>

  <div class="wsec">⚡ Tension y Potencia</div>
  <div class="wgrid g4">
    <div><div class="wl">Tension de Salida</div><div class="wv" style="color:#FFD700">{{d.outputVoltage}} <small>V</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.outputVoltage/500*100,100).toFixed(0)}}%;background:#FFD700"></div></div></div>
    <div><div class="wl">Potencia de Salida</div><div class="wv">{{d.power.toFixed(2)}} <small>kW</small></div></div>
    <div><div class="wl">Cos φ</div><div class="wv">{{d.cosPhi.toFixed(2)}}</div></div>
    <div><div class="wl">Temp. Motor</div><div class="wv" ng-style="{'color': d.motorTemp > 120 ? '#ff4444' : d.motorTemp > 80 ? '#FFD700' : '#44ff44'}">
      {{d.motorTemp.toFixed(1)}} <small>°C</small></div></div>
  </div>

  <div class="wsec">Operacion</div>
  <div class="wgrid g3">
    <div><div class="wl">Horas Energizado</div><div class="wv" style="font-size:20px">{{d.hoursEnergized}} <small>h</small></div></div>
    <div><div class="wl">Horas Habilitado</div><div class="wv" style="font-size:20px">{{d.hoursEnabled}} <small>h</small></div></div>
    <div><div class="wl">Estado de Falla</div>
      <div class="wv" style="font-size:16px;color:{{d.hasFault ? '#ff4444' : '#44ff44'}}">{{d.faultText}}</div></div>
  </div>

  <div ng-if="d.hasFault" class="wfb">⚠ Protecciones: P1={{d.fault1}} P2={{d.fault2}} P3={{d.fault3}} P4={{d.fault4}} P5={{d.fault5}}</div>
  <div ng-if="d.hasAlarm" class="wab">⚠ Alarmas: A1={{d.alarm1}} A2={{d.alarm2}} A3={{d.alarm3}} A4={{d.alarm4}} A5={{d.alarm5}}</div>
</div>`;
    console.log('Updated dashboard v3');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('\nAll v3 updates saved. Restart to apply.');
