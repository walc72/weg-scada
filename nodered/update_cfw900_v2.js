const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Update parser with correct CFW900 parameter mapping
const parseCFW = flows.find(n => n.id === 'weg_parse_cfw');
if (parseCFW) {
    parseCFW.func = `
// CFW900 Modbus Register Map
// Registers = WEG Parameters (Reg N = P000N)
// Drive is read directly via Modbus TCP (CFW-11 module)
const regs = msg.payload;

const device = {
    name: 'CFW900 #1',

    // --- Live operating data (only non-zero when RUNNING) ---
    speedRef: regs[1],               // P0001: Speed Reference (RPM)
    motorSpeed: regs[2],             // P0002: Motor Speed (RPM)
    motorCurrent: regs[3] / 10.0,    // P0003: Motor Current (A x10)
    dcBusVoltage: regs[4] / 10.0,    // P0004: DC Bus Voltage (V x10)
    outputFreq: regs[5] / 10.0,      // P0005: Output Frequency (Hz x10)
    statusWord: regs[6],             // P0006: Status Word / Logic Status
    motorTorque: regs[7] / 10.0,     // P0007: Motor Torque (% x10)
    outputVoltage: regs[8] / 10.0,   // P0008: Output Voltage (V x10)

    // --- Configuration params (always have values) ---
    nominalCurrent: regs[22] / 10.0, // P0022: Nominal Motor Current
    nominalVoltage: regs[24] / 10.0, // P0024: Nominal Motor Voltage
    faultCode: regs[26],             // P0026: Active Fault Code
    alarmCode: regs[27],             // P0027: Active Alarm Code

    // --- Extended (regs 40+) ---
    nominalFreq: regs[40] / 10.0,    // P0040: Nominal Motor Freq
    activePower: regs[43] / 10.0,    // P0043: Active Power (kW x10)

    online: true,
    commErrors: 0,
};

// Use motor speed if available, otherwise speed ref
device.speedRPM = device.motorSpeed > 0 ? device.motorSpeed : device.speedRef;
device.current = device.motorCurrent;
device.frequency = device.outputFreq;
device.voltage = device.dcBusVoltage;
device.motorVoltage = device.outputVoltage > 0 ? device.outputVoltage : device.nominalVoltage;
device.motorPower = device.activePower;

// Status decoding from P0006 (Logic Status)
// Bit 0: Ready, Bit 1: Running, Bit 2: Rotation dir
// If P0006=0 check if DC bus has voltage
device.ready = (device.statusWord & 0x0001) !== 0;
device.running = (device.statusWord & 0x0002) !== 0;
device.fault = device.faultCode > 0;
device.warning = device.alarmCode > 0;

if (device.fault) { device.statusText = 'FAULT'; device.statusColor = '#DC0000'; }
else if (device.running) { device.statusText = 'RUNNING'; device.statusColor = '#0064DC'; }
else if (device.ready) { device.statusText = 'READY'; device.statusColor = '#00B400'; }
else if (device.dcBusVoltage > 10) { device.statusText = 'STANDBY'; device.statusColor = '#C88200'; }
else { device.statusText = 'OFF'; device.statusColor = '#808080'; }

// Fault text
const ft = {
    0:'No Fault', 2:'F002: Overcurrent', 3:'F003: DC Overvoltage',
    4:'F004: IGBT Overtemp', 5:'F005: Motor Overload', 6:'F006: Drive Overtemp',
    7:'F007: Overcurrent Ph-U', 8:'F008: Overcurrent Ph-V', 9:'F009: Overcurrent Ph-W',
    12:'F012: Phase Loss', 21:'F021: Earth Fault', 22:'F022: Motor PTC',
    33:'F033: Undervoltage', 49:'F049: Stalled', 70:'F070: Comm Error',
    72:'F072: Fieldbus Timeout', 74:'F074: Serial Error'
};
device.faultText = ft[device.faultCode] || (device.faultCode > 0 ? 'Fault Code: ' + device.faultCode : 'No Fault');

const devices = [device];
flow.set('cfwDevices', devices);
flow.set('sswDevices', []);
msg.cfwDevices = devices;
return msg;
`;
    console.log('Updated CFW parser v2');
}

// Update dashboard to show nominal values and better layout
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.format = `<style>
.wb{padding:12px 16px;border-radius:6px;text-align:center;font-weight:bold;font-size:15px;color:white;margin-bottom:12px}
.wb-ok{background:#00802b}.wb-fault{background:#CC0000;animation:bl 1s infinite}.wb-standby{background:#C88200}
.wc{background:#1e1e1e;border-radius:8px;padding:16px;color:white;max-width:900px;margin:0 auto}
.wv{font-size:28px;font-weight:bold;margin:4px 0}
.wl{font-size:11px;color:#888;text-transform:uppercase}
.wbar{background:#333;border-radius:3px;height:6px;margin:4px 0}
.wbf{height:100%;border-radius:3px;transition:width .5s}
.ws{font-size:12px;padding:3px 10px;border-radius:4px;display:inline-block;color:white}
.wfb{margin-top:10px;padding:8px;background:#3a0000;border-radius:4px;color:#ff6666;font-size:13px}
.wsec{color:#FFD700;font-size:14px;font-weight:bold;margin:14px 0 8px 0}
.wnom{color:#666;font-size:10px}
@keyframes bl{50%{opacity:.5}}
</style>

<div class="wb" ng-class="{'wb-ok':!msg.banner.hasFaults && msg.cfwDevices[0].running,'wb-fault':msg.banner.hasFaults,'wb-standby':!msg.banner.hasFaults && !msg.cfwDevices[0].running}">{{msg.banner.text}}</div>

<div ng-repeat="d in msg.cfwDevices" class="wc" style="border-left:5px solid {{d.statusColor}}">
  <div style="font-size:16px;font-weight:bold;color:#aaa">{{d.name}}
    <span class="ws" style="background:{{d.statusColor}}">{{d.statusText}}</span>
    <span ng-if="d.warning" style="color:#FFD700;margin-left:8px">⚠ Alarm: {{d.alarmCode}}</span>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px">
    <div><div class="wl">Motor Speed</div><div class="wv">{{d.speedRPM}} <small>RPM</small></div>
      <div class="wnom">Ref: {{d.speedRef}} RPM</div></div>
    <div><div class="wl">Motor Current</div><div class="wv">{{d.current.toFixed(1)}} <small>A</small></div>
      <div class="wbar"><div class="wbf" style="width:{{d.nominalCurrent>0?Math.min(d.current/d.nominalCurrent*100,100).toFixed(0):0}}%;background:#0064DC"></div></div>
      <div class="wnom">Nominal: {{d.nominalCurrent.toFixed(1)}} A</div></div>
    <div><div class="wl">Output Frequency</div><div class="wv">{{d.frequency.toFixed(1)}} <small>Hz</small></div>
      <div class="wbar"><div class="wbf" style="width:{{d.nominalFreq>0?Math.min(d.frequency/d.nominalFreq*100,100).toFixed(0):0}}%;background:#00B400"></div></div>
      <div class="wnom">Nominal: {{d.nominalFreq.toFixed(1)}} Hz</div></div>
  </div>

  <div class="wsec">⚡ Voltage & Power</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
    <div><div class="wl">DC Bus Voltage</div><div class="wv" style="color:#FFD700">{{d.dcBusVoltage.toFixed(1)}} <small>V</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.dcBusVoltage/800*100,100).toFixed(0)}}%;background:#FFD700"></div></div></div>
    <div><div class="wl">Motor Voltage</div><div class="wv" style="color:#FFD700">{{d.motorVoltage.toFixed(1)}} <small>V</small></div>
      <div class="wbar"><div class="wbf" style="width:{{Math.min(d.motorVoltage/500*100,100).toFixed(0)}}%;background:#FFA500"></div></div>
      <div class="wnom">Nominal: {{d.nominalVoltage.toFixed(1)}} V</div></div>
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
    console.log('Updated dashboard v2');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved. Restart to apply.');
