var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// CFW900 drive configs
var drives = [
    { idx: 1, ip: '192.168.10.100', name: 'CFW900 #1' },
    { idx: 2, ip: '192.168.10.101', name: 'CFW900 #2' },
    { idx: 3, ip: '192.168.10.102', name: 'CFW900 #3' },
    { idx: 4, ip: '192.168.10.103', name: 'CFW900 #4' }
];

// Parser function template (same for all CFW900s, just different index)
function makeParserFunc(idx, name, ip) {
    return [
        '// Parse Modbus registers for ' + name,
        'var regs = msg.payload;',
        'if (!regs || regs.length < 50) { node.status({fill:"red",shape:"ring",text:"bad data"}); return null; }',
        '',
        'var devices = global.get("cfwDevices") || [null,null,null,null];',
        '',
        '// CFW900 native register map',
        'var speedRef = regs[1] || 0;',
        'var motorSpeed = regs[2] || 0;',
        'var current = (regs[3] || 0) / 10;',
        'var freq = (regs[5] || 0) / 10;',
        'var stateCode = regs[6] || 0;',
        'var voltage = regs[7] || 0;',
        'var power = (regs[10] || 0) / 100;',
        '',
        '// Cos phi is signed int16',
        'var cosRaw = regs[11] || 0;',
        'if (cosRaw > 32767) cosRaw -= 65536;',
        'var cosPhi = cosRaw / 100;',
        '',
        '// Hours (registers are in SECONDS)',
        'var secEnergized = (regs[42] || 0) + ((regs[43] || 0) << 16);',
        'var secEnabled = (regs[46] || 0) + ((regs[47] || 0) << 16);',
        '',
        '// Motor temp is signed /10',
        'var tempRaw = regs[365] || regs[49] || 0;',
        'if (tempRaw > 32767) tempRaw -= 65536;',
        'var motorTemp = tempRaw / 10;',
        '',
        '// Alarms & Faults',
        'var faults = [regs[50]||0, regs[51]||0, regs[52]||0, regs[53]||0, regs[54]||0];',
        'var alarms = [regs[60]||0, regs[61]||0, regs[62]||0, regs[63]||0, regs[64]||0];',
        'var hasFault = faults.some(function(v){return v>0;});',
        'var hasAlarm = alarms.some(function(v){return v>0;});',
        '',
        '// State decode',
        'var states = ["READY","RUNNING","UNDERVOLTAGE","PROTECTION","CONFIG","STO","POWER_OFF","DISABLED"];',
        'var running = stateCode === 1;',
        'var ready = stateCode === 0;',
        'var fault = stateCode === 3 || hasFault;',
        '',
        'devices[' + (idx - 1) + '] = {',
        '    name: "' + name + '",',
        '    ip: "' + ip + '",',
        '    stateCode: stateCode,',
        '    statusText: states[stateCode] || "UNKNOWN",',
        '    speedRef: speedRef,',
        '    motorSpeed: motorSpeed,',
        '    current: current,',
        '    frequency: freq,',
        '    outputVoltage: voltage,',
        '    outputCurrent: current,',
        '    outputFreq: freq,',
        '    power: power,',
        '    cosPhi: cosPhi,',
        '    motorTemp: motorTemp,',
        '    nominalCurrent: 150,',
        '    nominalVoltage: 500,',
        '    nominalFreq: 70,',
        '    hoursEnergized: (secEnergized / 3600).toFixed(1),',
        '    hoursEnabled: (secEnabled / 3600).toFixed(1),',
        '    online: true,',
        '    running: running,',
        '    ready: ready,',
        '    fault: fault,',
        '    hasFault: hasFault,',
        '    hasAlarm: hasAlarm,',
        '    faultText: hasFault ? "F" + faults.filter(function(v){return v>0;}).join("/F") : "Sin Falla",',
        '    alarmText: hasAlarm ? "A" + alarms.filter(function(v){return v>0;}).join("/A") : ""',
        '};',
        '',
        'global.set("cfwDevices", devices);',
        'node.status({fill:running?"blue":ready?"green":"yellow",shape:"dot",text:states[stateCode]+" "+motorSpeed+"rpm "+current+"A"});',
        'return null;'
    ].join('\n');
}

drives.forEach(function(drv) {
    var cfgId = 'weg_mb_cfg_' + drv.idx;
    var readId = 'weg_mb_read_' + drv.idx;
    var parserId = 'weg_d2_parser_cfw' + drv.idx;
    var yPos = 100 + (drv.idx - 1) * 80;

    // Skip #1 if already exists (just update parser)
    if (drv.idx === 1) {
        // Update existing parser
        var p1 = f.find(function(n){ return n.id === 'weg_d2_parser_cfw1'; });
        if (p1) {
            p1.func = makeParserFunc(1, drv.name, drv.ip);
            console.log('Updated parser for ' + drv.name);
        }
        return;
    }

    // Modbus client config for this drive
    if (!f.find(function(n){ return n.id === cfgId; })) {
        f.push({
            id: cfgId,
            type: 'modbus-client',
            name: drv.name,
            clienttype: 'tcp',
            bufferCommands: true,
            stateLogEnabled: false,
            queueLogEnabled: false,
            failureLogEnabled: true,
            tcpHost: drv.ip,
            tcpPort: '502',
            tcpType: 'DEFAULT',
            serialPort: '',
            serialType: 'RTU-BUFFERD',
            serialBaudrate: '9600',
            serialDatabits: '8',
            serialStopbits: '1',
            serialParity: 'none',
            serialConnectionDelay: '100',
            serialAsciiResponseStartDelimiter: '0x3A',
            unit_id: '1',
            commandDelay: '1',
            clientTimeout: '1000',
            reconnectOnTimeout: true,
            reconnectTimeout: '2000',
            parallelUnitIdsAllowed: true,
            showErrors: false,
            showWarnings: true,
            showLogs: false
        });
        console.log('Added Modbus client for ' + drv.name + ' (' + drv.ip + ')');
    }

    // Modbus read node
    if (!f.find(function(n){ return n.id === readId; })) {
        f.push({
            id: readId,
            type: 'modbus-read',
            z: 'weg_d2_tab',
            name: 'Read ' + drv.name,
            topic: '',
            showStatusActivities: true,
            logIOActivities: false,
            showErrors: true,
            showWarnings: true,
            unitid: '1',
            dataType: 'HoldingRegister',
            adr: '0',
            quantity: '70',
            rate: '2',
            rateUnit: 's',
            delayOnStart: false,
            startDelayTime: '',
            server: cfgId,
            useIOFile: false,
            ioFile: '',
            useIOForPayload: false,
            emptyMsgOnFail: false,
            x: 220,
            y: yPos,
            wires: [[parserId], []]
        });
        console.log('Added Modbus read for ' + drv.name);
    }

    // Parser function
    if (!f.find(function(n){ return n.id === parserId; })) {
        f.push({
            id: parserId,
            type: 'function',
            z: 'weg_d2_tab',
            name: 'Parse ' + drv.name + ' -> global',
            func: makeParserFunc(drv.idx, drv.name, drv.ip),
            outputs: 1,
            x: 480,
            y: yPos,
            wires: [[]]
        });
        console.log('Added parser for ' + drv.name);
    }
});

// Also add offline detection - if a drive doesn't update in 10s, mark offline
var offlineId = 'weg_offline_check';
if (!f.find(function(n){ return n.id === offlineId; })) {
    f.push({
        id: offlineId,
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Offline Check',
        func: [
            '// Check each drive - if no Modbus response, it stays null/old',
            '// The parser sets online=true on each successful read',
            '// This node marks drives as offline if parser hasnt updated recently',
            'var devices = global.get("cfwDevices") || [null,null,null,null];',
            'var now = Date.now();',
            'var changed = false;',
            'for (var i = 0; i < 4; i++) {',
            '    var d = devices[i];',
            '    if (d && d.online && d._lastUpdate) {',
            '        if (now - d._lastUpdate > 10000) {',
            '            d.online = false;',
            '            changed = true;',
            '        }',
            '    }',
            '}',
            'if (changed) global.set("cfwDevices", devices);',
            'return null;'
        ].join('\n'),
        outputs: 1,
        x: 480,
        y: 500,
        wires: [[]]
    });

    // Add inject for offline check every 5s
    f.push({
        id: 'weg_offline_tick',
        type: 'inject',
        z: 'weg_d2_tab',
        name: 'Offline 5s',
        repeat: '5',
        once: true,
        onceDelay: '20',
        topic: '',
        props: [],
        x: 220,
        y: 500,
        wires: [[offlineId]]
    });
    console.log('Added offline detection (5s check)');
}

// Update parsers to set _lastUpdate timestamp
drives.forEach(function(drv) {
    var parserId = 'weg_d2_parser_cfw' + drv.idx;
    var parser = f.find(function(n){ return n.id === parserId; });
    if (parser && parser.func.indexOf('_lastUpdate') === -1) {
        parser.func = parser.func.replace(
            'global.set("cfwDevices", devices);',
            'devices[' + (drv.idx - 1) + ']._lastUpdate = Date.now();\nglobal.set("cfwDevices", devices);'
        );
    }
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - All 4 CFW900 drives configured with Modbus + parsers');
