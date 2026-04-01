const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// ============================================================
// SIMPLIFY: Only CFW#1 is online. Use the ORIGINAL read+parser
// Disable all other reads. Use a single clean pipeline.
// ============================================================

// 1. Fix the ORIGINAL parser (weg_parse_cfw) to handle CFW#1 correctly
const parseCFW = flows.find(n => n.id === 'weg_parse_cfw');
if (parseCFW) {
    parseCFW.func = `
var stateNames = {0:'READY',1:'RUNNING',2:'UNDERVOLTAGE',3:'PROTECTION',4:'CONFIG',5:'STO',6:'POWER OFF',7:'DISABLED',8:'SS1',9:'AUTOTUNE'};
var stateColors = {0:'#22c55e',1:'#3b82f6',2:'#f59e0b',3:'#ef4444',4:'#94a3b8',5:'#f97316',6:'#6b7280',7:'#9ca3af'};
var ft = {0:'Sin Falla',1:'F001: Sobrecorriente',2:'F002: Sobretension',3:'F003: Falla tierra',4:'F004: Sobretemp IGBT',5:'F005: Sobrecarga motor',6:'F006: Sobretemp drive',7:'F007: Subtension DC',12:'F012: Perdida fase',33:'F033: Subtension',49:'F049: Motor bloqueado',70:'F070: Error comm'};

var regs = msg.payload;
var d = {
    name: 'CFW900 #1', ip: '192.168.10.100',
    stateCode: regs[6], speedRef: regs[1], motorSpeed: regs[2],
    outputCurrent: regs[3] / 10.0, outputFreq: regs[5] / 10.0,
    outputVoltage: regs[7], outputPower: regs[10] / 100.0,
    cosPhi: (regs[11] > 32767 ? regs[11]-65536 : regs[11]) / 100.0,
    nominalCurrent: regs[22] / 10.0, nominalVoltage: regs[24] / 10.0,
    nominalFreq: regs[40] / 10.0,
    fault1:regs[60]||0, fault2:regs[61]||0, fault3:regs[62]||0, fault4:regs[63]||0, fault5:regs[64]||0,
    alarm1:regs[50]||0, alarm2:regs[51]||0, alarm3:regs[52]||0, alarm4:regs[53]||0, alarm5:regs[54]||0,
    secondsEnergized: regs[42], hoursEnergized: (regs[42]/3600).toFixed(1),
    secondsEnabled: regs[46], hoursEnabled: (regs[46]/3600).toFixed(1),
    motorTorque: 0, motorTemp: flow.get('cfwTemp_1') || 0,
    online: true, lastUpdate: Date.now()
};
d.speedRPM = d.motorSpeed; d.current = d.outputCurrent;
d.frequency = d.outputFreq; d.power = d.outputPower;
d.statusText = stateNames[d.stateCode] || 'UNKNOWN';
d.statusColor = stateColors[d.stateCode] || '#94a3b8';
d.running = d.stateCode === 1; d.ready = d.stateCode === 0;
d.fault = d.stateCode === 3; d.hasFault = d.fault1 > 0;
d.hasAlarm = d.alarm1 > 0;
d.faultText = ft[d.fault1] || (d.fault1>0 ? 'Proteccion: '+d.fault1 : 'Sin Falla');
d.alarmText = d.alarm1>0 ? 'Alarma: '+d.alarm1 : '';

// Store CFW#1 at index 0, others stay null (offline)
var devices = [d, null, null, null];
flow.set('cfwDevices', devices);
return null;
`;
    // Wire ONLY to nowhere (data goes to flow context, dashboard reads on tick)
    parseCFW.wires = [[]];
    parseCFW.x = 480;
    parseCFW.y = 140;
    console.log('Fixed CFW parser - stores to flow context only');
}

// 2. Fix the original read node to point to parser
const readCFW = flows.find(n => n.id === 'weg_read_cfw');
if (readCFW) {
    readCFW.wires = [['weg_parse_cfw'], []];
    readCFW.name = 'Read CFW900 #1 (192.168.10.100)';
    readCFW.adr = '0';
    readCFW.quantity = '71';
    readCFW.rate = '2';
    readCFW.rateUnit = 's';
    console.log('Fixed read CFW#1 -> parser');
}

// 3. Disable all other read nodes (they point to offline IPs)
['weg_read_cfw2','weg_read_cfw3','weg_read_cfw4'].forEach(id => {
    const n = flows.find(f => f.id === id);
    if (n) {
        n.wires = [[], []];
        n.rate = '300'; // poll every 5 min to not spam errors
        console.log('Slowed down ' + id);
    }
});

// 4. Fix combine to use simple logic
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.func = `
var raw = flow.get('cfwDevices') || [null,null,null,null];
var sswDevices = flow.get('sswDevices') || [];

var cfwIPs = ['192.168.10.100','192.168.10.101','192.168.10.102','192.168.10.103'];
var cfwDevices = [];
var online = 0;
var running = 0;
var faults = [];

for (var i = 0; i < 4; i++) {
    var r = raw[i];
    if (r && r.online && r.lastUpdate && (Date.now() - r.lastUpdate) < 15000) {
        cfwDevices.push(r);
        online++;
        if (r.running) running++;
        if (r.hasFault) faults.push(r.name + ': ' + r.faultText);
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

var agriplus = { cfwDevices: cfwDevices, sswDevices: sswDevices.slice(0, 2) };
var agrocaraya = { sswDevices: sswDevices.slice(2, 3) };

var banner;
if (faults.length > 0) {
    banner = { text: faults.join(' | '), color: '#dc2626', hasFaults: true };
} else if (running > 0) {
    banner = { text: running + '/' + online + ' DRIVES RUNNING', color: '#2563eb', hasFaults: false };
} else if (online > 0) {
    banner = { text: online + '/4 DRIVES ONLINE — ALL READY', color: '#16a34a', hasFaults: false };
} else {
    banner = { text: 'CONNECTING...', color: '#94a3b8', hasFaults: false };
}

msg.cfwDevices = cfwDevices;
msg.sswDevices = sswDevices;
msg.agriplus = agriplus;
msg.agrocaraya = agrocaraya;
msg.banner = banner;
msg.stats = { running: running, total: online, faults: faults.length, offline: 4 - online };
return msg;
`;
    console.log('Fixed combine with 15s timeout check');
}

// 5. Make sure the dashboard tick is wired correctly
const dashInject = flows.find(n => n.id === 'weg_dash_inject');
if (dashInject) {
    dashInject.repeat = '3';
    dashInject.wires = [['weg_combine_dashboard']];
    console.log('Dashboard tick -> combine');
}

// 6. Disable broken nodes
['weg_parse_all_cfw', 'weg_join_data', 'weg_dashboard_trigger'].forEach(id => {
    const n = flows.find(f => f.id === id);
    if (n) { n.wires = [[]]; n.x = 9999; n.y = 9999; }
});

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('ALL FIXES APPLIED.');
