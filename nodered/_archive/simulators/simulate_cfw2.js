var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Add a simulator inject that feeds fake data for CFW900 #2
// It writes to global context as if the drive were online and running

if (!f.find(function(n){return n.id==='weg_d2_sim_inject'})) {
    f.push({
        id: 'weg_d2_sim_inject',
        type: 'inject',
        z: 'weg_d2_tab',
        name: 'Simulate CFW#2 Running',
        repeat: '2',
        once: true,
        onceDelay: '8',
        topic: '',
        props: [],
        x: 250,
        y: 500,
        wires: [['weg_d2_sim_fn']]
    });
}

if (!f.find(function(n){return n.id==='weg_d2_sim_fn'})) {
    f.push({
        id: 'weg_d2_sim_fn',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'CFW#2 Simulator',
        func: [
            '// Simulate CFW900 #2 as RUNNING with realistic values',
            'var devices = global.get("cfwDevices") || [null,null,null,null];',
            '',
            '// Add some variation to make it look alive',
            'var t = Date.now() / 1000;',
            'var noise = Math.sin(t * 0.5) * 0.5;',
            '',
            'devices[1] = {',
            '    name: "CFW900 #2",',
            '    ip: "192.168.10.101",',
            '    stateCode: 1,  // RUNNING',
            '    speedRef: 1750,',
            '    motorSpeed: Math.round(1742 + noise * 8),',
            '    outputCurrent: parseFloat((45.2 + noise * 3).toFixed(1)),',
            '    outputFreq: parseFloat((59.8 + noise * 0.3).toFixed(1)),',
            '    outputVoltage: Math.round(438 + noise * 5),',
            '    outputPower: parseFloat((28.5 + noise * 2).toFixed(2)),',
            '    cosPhi: parseFloat((0.87 + noise * 0.02).toFixed(2)),',
            '    nominalCurrent: 109.0,',
            '    nominalVoltage: 460,',
            '    nominalFreq: 60.0,',
            '    fault1: 0, fault2: 0, fault3: 0, fault4: 0, fault5: 0,',
            '    alarm1: 0, alarm2: 0, alarm3: 0, alarm4: 0, alarm5: 0,',
            '    secondsEnergized: Math.round(t % 86400),',
            '    hoursEnergized: ((t % 86400) / 3600).toFixed(1),',
            '    secondsEnabled: Math.round((t % 86400) * 0.8),',
            '    hoursEnabled: (((t % 86400) * 0.8) / 3600).toFixed(1),',
            '    motorTorque: parseFloat((62.5 + noise * 5).toFixed(1)),',
            '    motorTemp: parseFloat((72.3 + noise * 0.5).toFixed(1)),',
            '    online: true,',
            '    running: true,',
            '    ready: false,',
            '    fault: false,',
            '    hasFault: false,',
            '    hasAlarm: false,',
            '    faultText: "Sin Falla",',
            '    alarmText: "",',
            '    statusText: "RUNNING",',
            '    statusColor: "#3b82f6",',
            '    current: parseFloat((45.2 + noise * 3).toFixed(1)),',
            '    frequency: parseFloat((59.8 + noise * 0.3).toFixed(1)),',
            '    power: parseFloat((28.5 + noise * 2).toFixed(2)),',
            '    speedRPM: Math.round(1742 + noise * 8),',
            '    voltage: Math.round(438 + noise * 5),',
            '    gaugeConfig: global.get("gaugeConfigPerDrive") ? global.get("gaugeConfigPerDrive")[1] : null',
            '};',
            '',
            'global.set("cfwDevices", devices);',
            'return null;'
        ].join('\n'),
        outputs: 1,
        x: 480,
        y: 500,
        wires: [[]]
    });
}

console.log('Added CFW#2 simulator (RUNNING state)');
fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
