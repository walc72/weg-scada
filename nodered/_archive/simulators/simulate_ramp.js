var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Update the CFW#2 simulator to ramp values up over ~90 seconds
// so the user can see gauge zone colors change from green → yellow → red

var sim = f.find(function(n) { return n.id === 'weg_d2_sim_fn'; });
if (!sim) { console.log('Simulator function not found'); process.exit(1); }

sim.func = [
    '// Ramp CFW#2 values from 0 to max over ~90 seconds',
    '// to visualize gauge zone color transitions',
    'var devices = global.get("cfwDevices") || [null,null,null,null];',
    '',
    '// Track start time in context',
    'var startTime = context.get("startTime");',
    'if (!startTime) { startTime = Date.now(); context.set("startTime", startTime); }',
    '',
    '// Progress: 0 → 1 over 90 seconds, then reset and loop',
    'var elapsed = (Date.now() - startTime) / 1000;',
    'var cycleDuration = 90; // seconds per full ramp',
    'var progress = (elapsed % cycleDuration) / cycleDuration;',
    '',
    '// Ramp each value from 0 to slightly above max',
    '// Velocidad: 0 → 1800 RPM (zones at 1200 and 1500)',
    'var speed = Math.round(progress * 1850);',
    '// Corriente: 0 → 150 A (zones at 80 and 120)',
    'var current = parseFloat((progress * 155).toFixed(1));',
    '// Tensión: 0 → 500 V (zones at 380 and 480)',
    'var voltage = Math.round(progress * 510);',
    '// Frecuencia: 0 → 70 Hz (zones at 50 and 62)',
    'var freq = parseFloat((progress * 72).toFixed(1));',
    '// Potencia: 0 → 100 kW (zones at 60 and 85)',
    'var power = parseFloat((progress * 105).toFixed(2));',
    '// Temp: 0 → 150 °C (zones at 80 and 120)',
    'var temp = parseFloat((progress * 155).toFixed(1));',
    '',
    'var pctText = Math.round(progress * 100) + "%";',
    'node.status({fill:"blue",shape:"dot",text:"Ramp: " + pctText + " | RPM:" + speed + " A:" + current});',
    '',
    'devices[1] = {',
    '    name: "CFW900 #2",',
    '    ip: "192.168.10.101",',
    '    stateCode: 1,',
    '    speedRef: 1800,',
    '    motorSpeed: speed,',
    '    outputCurrent: current,',
    '    outputFreq: freq,',
    '    outputVoltage: voltage,',
    '    outputPower: power,',
    '    cosPhi: 0.87,',
    '    nominalCurrent: 150,',
    '    nominalVoltage: 500,',
    '    nominalFreq: 70,',
    '    fault1: 0, fault2: 0, fault3: 0, fault4: 0, fault5: 0,',
    '    alarm1: 0, alarm2: 0, alarm3: 0, alarm4: 0, alarm5: 0,',
    '    secondsEnergized: Math.round(elapsed),',
    '    hoursEnergized: (elapsed / 3600).toFixed(1),',
    '    secondsEnabled: Math.round(elapsed * 0.8),',
    '    hoursEnabled: ((elapsed * 0.8) / 3600).toFixed(1),',
    '    motorTorque: parseFloat((progress * 100).toFixed(1)),',
    '    motorTemp: temp,',
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
    '    current: current,',
    '    frequency: freq,',
    '    power: power,',
    '    speedRPM: speed,',
    '    voltage: voltage,',
    '    gaugeConfig: global.get("gaugeConfigPerDrive") ? global.get("gaugeConfigPerDrive")[1] : null',
    '};',
    '',
    'global.set("cfwDevices", devices);',
    'return null;'
].join('\n');

// Make it update every 1 second for smoother ramp
var inject = f.find(function(n) { return n.id === 'weg_d2_sim_inject'; });
if (inject) {
    inject.repeat = '1';
    inject.name = 'Ramp CFW#2 (90s cycle)';
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Simulator updated: values ramp 0→max over 90 seconds, then loop');
