const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.func = `
var raw = flow.get('cfwDevices') || [];
var sswDevices = flow.get('sswDevices') || [];

// Always show 4 CFW slots, fill offline ones with placeholder
var cfwIPs = ['192.168.10.100','192.168.10.101','192.168.10.102','192.168.10.103'];
var cfwDevices = [];
for (var i = 0; i < 4; i++) {
    if (raw[i] && raw[i].name) {
        cfwDevices.push(raw[i]);
    } else {
        cfwDevices.push({
            name: 'CFW900 #' + (i+1),
            ip: cfwIPs[i],
            stateCode: -1,
            statusText: 'OFFLINE',
            statusColor: '#444444',
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
            faultText:'Sin conexion', alarmText:'',
            online:false
        });
    }
}

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
    banner = { text: '[' + (fidx+1) + '/' + faults.length + '] ' + faults[fidx], color: '#DC0000', hasFaults: true, faultCount: faults.length };
} else if (running > 0) {
    banner = { text: running + '/' + online + ' DRIVES RUNNING', color: '#0064DC', hasFaults: false };
} else if (online > 0) {
    banner = { text: online + '/4 DRIVES ONLINE — ALL READY', color: '#00802b', hasFaults: false };
} else {
    banner = { text: 'CONNECTING...', color: '#888', hasFaults: false };
}

msg.cfwDevices = cfwDevices;
msg.sswDevices = sswDevices;
msg.banner = banner;
msg.stats = { running: running, total: online, faults: faults.length, offline: 4 - online };
return msg;
`;
    console.log('Updated combine - always shows 4 CFW slots');
}

// Update dashboard to handle offline cards
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    // Add offline styling to existing template
    let html = uiOverview.format;

    // Replace the CFW card opening to add offline class
    html = html.replace(
        `class="S-card" ng-if="d && d.name" style="border-left:3px solid {{d.statusColor}}"`,
        `class="S-card" ng-class="{'S-offline': !d.online}" style="border-left:3px solid {{d.statusColor}}"`
    );

    // Update stats display to show offline count
    html = html.replace(
        `<div class="S-stat-lbl">Faults</div>`,
        `<div class="S-stat-lbl">Faults</div></div>
    <div class="S-stat"><div class="S-stat-val" style="color:{{msg.stats.offline>0?'#888':'#333'}}">{{msg.stats.offline || 0}}</div><div class="S-stat-lbl">Offline</div>`
    );

    uiOverview.format = html;
    console.log('Updated dashboard with offline display');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved. Restart to apply.');
