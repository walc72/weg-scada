const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// ============================================================
// SHARED PARSER FUNCTION (reused by each drive's function node)
// ============================================================
const parserCode = `
var stateNames = {0:'READY',1:'RUNNING',2:'UNDERVOLTAGE',3:'PROTECTION',4:'CONFIG',5:'STO',6:'POWER OFF',7:'DISABLED',8:'SS1',9:'AUTOTUNE'};
var stateColors = {0:'#00ff88',1:'#00aaff',2:'#C88200',3:'#ff4444',4:'#888',5:'#ff6600',6:'#666',7:'#999'};
var ft = {0:'Sin Falla',1:'F001: Sobrecorriente',2:'F002: Sobretension',3:'F003: Falla tierra',4:'F004: Sobretemp IGBT',5:'F005: Sobrecarga motor',6:'F006: Sobretemp drive',7:'F007: Subtension DC',8:'F008: Falla comm',12:'F012: Perdida fase',21:'F021: Falla tierra',33:'F033: Subtension',49:'F049: Motor bloqueado',70:'F070: Error comm'};

var regs = msg.payload;
var d = {
    name: 'CFW900 #' + DRIVE_NUM,
    ip: DRIVE_IP,
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
    fault1:regs[60]||0, fault2:regs[61]||0, fault3:regs[62]||0, fault4:regs[63]||0, fault5:regs[64]||0,
    alarm1:regs[50]||0, alarm2:regs[51]||0, alarm3:regs[52]||0, alarm4:regs[53]||0, alarm5:regs[54]||0,
    secondsEnergized: regs[42],
    hoursEnergized: (regs[42]/3600).toFixed(1),
    secondsEnabled: regs[46],
    hoursEnabled: (regs[46]/3600).toFixed(1),
    motorTorque: 0,
    motorTemp: flow.get('cfwTemp_' + DRIVE_NUM) || 0,
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

// Store in array at fixed index
var devices = flow.get('cfwDevices') || [null,null,null,null];
devices[DRIVE_IDX] = d;
flow.set('cfwDevices', devices);

// Trigger dashboard update
msg.cfwDevices = devices;
return msg;
`;

// ============================================================
// 1. Remove the broken unified parser
// ============================================================
const oldUnified = flows.find(n => n.id === 'weg_parse_all_cfw');
if (oldUnified) {
    oldUnified.func = 'return null;';
    oldUnified.x = 9999;
    oldUnified.y = 9999;
}

// ============================================================
// 2. Create individual parser for each CFW900
// ============================================================
const driveConfig = [
    { num: 1, ip: '192.168.10.100', idx: 0, readId: 'weg_read_cfw' },
    { num: 2, ip: '192.168.10.101', idx: 1, readId: 'weg_read_cfw2' },
    { num: 3, ip: '192.168.10.102', idx: 2, readId: 'weg_read_cfw3' },
    { num: 4, ip: '192.168.10.103', idx: 3, readId: 'weg_read_cfw4' },
];

driveConfig.forEach(cfg => {
    const parserId = 'weg_parse_cfw_' + cfg.num;

    // Create the parser code with drive-specific values
    const code = parserCode
        .replace(/DRIVE_NUM/g, cfg.num)
        .replace(/DRIVE_IP/g, "'" + cfg.ip + "'")
        .replace(/DRIVE_IDX/g, cfg.idx);

    // Check if exists, create or update
    let parser = flows.find(n => n.id === parserId);
    if (!parser) {
        parser = {
            id: parserId,
            type: 'function',
            z: 'weg_flow_tab',
            name: 'Parse CFW #' + cfg.num,
            outputs: 1,
            timeout: '',
            noerr: 0,
            initialize: '',
            finalize: '',
            libs: [],
            x: 480,
            y: 120 + (cfg.idx * 50)
        };
        flows.push(parser);
    }
    parser.func = code;
    parser.wires = [['weg_dashboard_trigger']];

    // Update the read node to wire to this parser
    const readNode = flows.find(n => n.id === cfg.readId);
    if (readNode) {
        readNode.wires = [[parserId], []];
        console.log('Wired ' + readNode.name + ' -> Parse CFW #' + cfg.num);
    }
});

// ============================================================
// 3. Create a trigger node that debounces dashboard updates
// ============================================================
if (!flows.find(n => n.id === 'weg_dashboard_trigger')) {
    flows.push({
        id: 'weg_dashboard_trigger',
        type: 'delay',
        z: 'weg_flow_tab',
        name: 'Debounce 200ms',
        pauseType: 'rate',
        timeout: '200',
        timeoutUnits: 'milliseconds',
        rate: '2',
        nbRateUnits: '1',
        rateUnits: 'second',
        randomFirst: '1',
        randomLast: '5',
        randomUnits: 'seconds',
        drop: true,
        allowrate: false,
        outputs: 1,
        x: 680,
        y: 170,
        wires: [['weg_combine_dashboard', 'weg_alarm_detector', 'weg_voltage_monitor', 'weg_csv_builder']]
    });
}

// ============================================================
// 4. Fix SSW initialization - use a one-shot inject
// ============================================================
const parseSSW = flows.find(n => n.id === 'weg_parse_ssw');
if (parseSSW) {
    parseSSW.func = `
// Store motor temp from reg 365
var regs = msg.payload;
if (regs && regs[0] !== undefined) {
    var temp = regs[0];
    if (temp > 32767) temp = temp - 65536;
    flow.set('cfwTemp_1', temp / 10.0);
}
return null;
`;
}

// Add SSW init inject node
if (!flows.find(n => n.id === 'weg_ssw_init')) {
    flows.push({
        id: 'weg_ssw_init',
        type: 'inject',
        z: 'weg_flow_tab',
        name: 'Init SSW900 placeholders',
        props: [],
        repeat: '',
        crontab: '',
        once: true,
        onceDelay: '2',
        topic: '',
        x: 250,
        y: 560,
        wires: [['weg_ssw_init_fn']]
    });

    flows.push({
        id: 'weg_ssw_init_fn',
        type: 'function',
        z: 'weg_flow_tab',
        name: 'Create SSW900 placeholders',
        func: `
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
node.status({fill:'green',shape:'dot',text:'3 SSW900 initialized'});
return null;
`,
        outputs: 1,
        x: 480,
        y: 560,
        wires: [[]]
    });
}

// ============================================================
// 5. Fix combine to always read fresh from flow context
// ============================================================
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.func = `
var cfwDevices = flow.get('cfwDevices') || [];
var sswDevices = flow.get('sswDevices') || [];

// Filter out null entries
cfwDevices = cfwDevices.filter(function(d) { return d && d.name; });

var faults = [];
var running = 0;
var total = cfwDevices.length;

cfwDevices.forEach(function(d) {
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
// 6. Also fix the trend split nodes
// ============================================================
const cfwTrendSplit = flows.find(n => n.id === 'weg_cfw_trend_split');
if (cfwTrendSplit) {
    cfwTrendSplit.func = `
var d = flow.get('cfwDevices') || [];
var out = [];
for (var i = 0; i < 4; i++) {
    if (d[i]) {
        out.push({payload: d[i].current, topic: 'CFW#'+(i+1)});
    } else {
        out.push(null);
    }
}
for (var i = 0; i < 4; i++) {
    if (d[i]) {
        out.push({payload: d[i].outputVoltage, topic: 'CFW#'+(i+1)});
    } else {
        out.push(null);
    }
}
return out;
`;
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('All parser fixes applied. Restart to apply.');
