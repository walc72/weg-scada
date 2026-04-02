const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// 1. Update Modbus read for single CFW900
const readCFW = flows.find(n => n.id === 'weg_read_cfw');
if (readCFW) {
    readCFW.name = 'Read CFW900 #1 (192.168.10.100)';
    readCFW.adr = '0';
    readCFW.quantity = '50';
    console.log('Updated read CFW node: regs 0-49');
}

// 2. Disable SSW read
const readSSW = flows.find(n => n.id === 'weg_read_ssw');
if (readSSW) {
    readSSW.name = 'Read SSW900 (DISABLED - no TCP)';
    readSSW.rate = '60';
    readSSW.adr = '999';
    console.log('Disabled SSW read');
}

// 3. Update parser for native CFW900 register map
const parseCFW = flows.find(n => n.id === 'weg_parse_cfw');
if (parseCFW) {
    parseCFW.func = `
const regs = msg.payload;

const device = {
    name: 'CFW900 #1',
    statusWord: regs[0],
    speedRPM: regs[1],
    speedRef: regs[2] / 10.0,
    dcBusVoltage: regs[4] / 10.0,
    outputCurrent: regs[5] / 10.0,
    motorTorque: regs[6] / 10.0,
    motorCurrent: regs[22] / 10.0,
    motorVoltage: regs[24] / 10.0,
    faultCode: regs[26],
    alarmCode: regs[27],
    outputFreq: regs[40] / 10.0,
    motorPower: regs[43] / 10.0,
    online: true,
    commErrors: 0,
    ready:   (regs[0] & 0x0001) !== 0,
    running: (regs[0] & 0x0002) !== 0,
    fault:   (regs[0] & 0x0008) !== 0,
    warning: (regs[0] & 0x0080) !== 0,
};

if (device.fault) { device.statusText = 'FAULT'; device.statusColor = '#DC0000'; }
else if (device.running) { device.statusText = 'RUNNING'; device.statusColor = '#0064DC'; }
else if (device.ready) { device.statusText = 'READY'; device.statusColor = '#00B400'; }
else { device.statusText = 'OFF'; device.statusColor = '#808080'; }

device.current = device.outputCurrent > 0 ? device.outputCurrent : device.motorCurrent;
device.frequency = device.outputFreq;
device.voltage = device.dcBusVoltage;

const ft = {0:'No Fault',2:'F002: Overcurrent',3:'F003: DC Overvoltage',4:'F004: IGBT Overtemp',5:'F005: Motor Overload',6:'F006: Drive Overtemp',12:'F012: Phase Loss',21:'F021: Earth Fault',33:'F033: Undervoltage',49:'F049: Stalled',70:'F070: Comm Error'};
device.faultText = ft[device.faultCode] || (device.faultCode > 0 ? 'Fault: ' + device.faultCode : 'No Fault');

const devices = [device];
flow.set('cfwDevices', devices);
flow.set('sswDevices', []);
msg.cfwDevices = devices;
return msg;
`;
    console.log('Updated CFW parser');
}

// 4. Update combine+banner
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.func = `
const cfwDevices = flow.get('cfwDevices') || [];
const faults = [];
cfwDevices.forEach(d => { if (d.fault) faults.push(d.name + ': ' + d.faultText); });
let banner;
if (faults.length === 0) {
    banner = { text: 'CFW900 #1 - SYSTEM OK', color: '#00B400', hasFaults: false, faultCount: 0 };
} else {
    banner = { text: faults.join(' | '), color: '#DC0000', hasFaults: true, faultCount: faults.length };
}
msg.cfwDevices = cfwDevices;
msg.sswDevices = [];
msg.banner = banner;
return msg;
`;
    console.log('Updated banner');
}

// 5. Update dashboard template for single drive detail
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.format = `<style>
.wb{padding:12px 16px;border-radius:6px;text-align:center;font-weight:bold;font-size:15px;color:white;margin-bottom:12px}
.wb-ok{background:#00802b}.wb-fault{background:#CC0000;animation:bl 1s infinite}
.wc{background:#1e1e1e;border-radius:8px;padding:16px;color:white;max-width:900px;margin:0 auto}
.wv{font-size:28px;font-weight:bold;margin:4px 0}
.wl{font-size:11px;color:#888;text-transform:uppercase}
.wbar{background:#333;border-radius:3px;height:6px;margin:4px 0}
.wbf{height:100%;border-radius:3px;transition:width .5s}
.ws{font-size:12px;padding:3px 10px;border-radius:4px;display:inline-block;color:white}
.wfb{margin-top:10px;padding:8px;background:#3a0000;border-radius:4px;color:#ff6666;font-size:13px}
.wsec{color:#FFD700;font-size:15px;font-weight:bold;margin:12px 0 8px 0}
@keyframes bl{50%{opacity:.5}}
</style>

<div class="wb" ng-class="{'wb-ok':!msg.banner.hasFaults,'wb-fault':msg.banner.hasFaults}">{{msg.banner.text}}</div>

<div ng-repeat="d in msg.cfwDevices" class="wc" style="border-left:5px solid {{d.statusColor}}">
  <div style="font-size:16px;font-weight:bold;color:#aaa">{{d.name}}
    <span class="ws" style="background:{{d.statusColor}}">{{d.statusText}}</span>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px">
    <div><div class="wl">Speed</div><div class="wv">{{d.speedRPM}} <small>RPM</small></div></div>
    <div><div class="wl">Output Current</div><div class="wv">{{d.current.toFixed(1)}} <small>A</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.current/25*100,100).toFixed(0)}}%;background:#0064DC"></div></div></div>
    <div><div class="wl">Output Frequency</div><div class="wv">{{d.frequency.toFixed(1)}} <small>Hz</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.frequency/60*100,100).toFixed(0)}}%;background:#00B400"></div></div></div>
  </div>

  <div class="wsec">⚡ Voltage & Power</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
    <div><div class="wl">DC Bus Voltage</div><div class="wv" style="color:#FFD700">{{d.dcBusVoltage.toFixed(1)}} <small>V</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.dcBusVoltage/800*100,100).toFixed(0)}}%;background:#FFD700"></div></div></div>
    <div><div class="wl">Motor Voltage</div><div class="wv" style="color:#FFD700">{{d.motorVoltage.toFixed(1)}} <small>V</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.motorVoltage/500*100,100).toFixed(0)}}%;background:#FFA500"></div></div></div>
    <div><div class="wl">Active Power</div><div class="wv">{{d.motorPower.toFixed(1)}} <small>kW</small></div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
    <div><div class="wl">Motor Torque</div><div class="wv">{{d.motorTorque.toFixed(1)}} <small>%</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(Math.abs(d.motorTorque),100).toFixed(0)}}%;background:#C88200"></div></div></div>
    <div><div class="wl">Fault Status</div>
      <div class="wv" style="font-size:18px;color:{{d.faultCode > 0 ? '#ff4444' : '#44ff44'}}">{{d.faultText}}</div></div>
  </div>

  <div ng-if="d.fault" class="wfb">⚠ {{d.faultText}}</div>
</div>`;
    console.log('Updated dashboard template');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('\nAll done. Restart to apply.');
