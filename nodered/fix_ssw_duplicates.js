const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Fix: SSW parser should only run once at init, not on every temp read
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

// SSW900 placeholders - only set if not already set
if (!flow.get('sswInitDone')) {
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
    flow.set('sswInitDone', true);
}
return null;
`;
    console.log('Fixed SSW duplicates');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved.');
