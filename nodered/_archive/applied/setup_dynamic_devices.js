var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// PART 1: Create SSW900 placeholder nodes (Agriplus + Agrocaraya)
// ============================================================

var sswDrives = [
    { idx: 5, ip: '192.168.10.110', name: 'SSW900 #1', site: 'agriplus' },
    { idx: 6, ip: '192.168.10.111', name: 'SSW900 #2', site: 'agriplus' },
    { idx: 7, ip: '192.168.10.120', name: 'SSW900 Agrocaraya', site: 'agrocaraya' }
];

function makeSswParserFunc(idx, name, ip) {
    return [
        '// Parse Modbus registers for ' + name + ' (SSW900 - Soft Starter)',
        'var regs = msg.payload;',
        'if (!regs || regs.length < 30) { node.status({fill:"red",shape:"ring",text:"bad data"}); return null; }',
        '',
        'var devices = global.get("cfwDevices") || [null,null,null,null,null,null,null];',
        '',
        '// SSW900 register map (different from CFW900)',
        'var current = (regs[3] || 0) / 10;',
        'var stateCode = regs[6] || 0;',
        'var voltage = regs[7] || 0;',
        'var power = (regs[10] || 0) / 100;',
        'var cosRaw = regs[11] || 0;',
        'if (cosRaw > 32767) cosRaw -= 65536;',
        'var cosPhi = cosRaw / 100;',
        '',
        'var tempRaw = regs[49] || 0;',
        'if (tempRaw > 32767) tempRaw -= 65536;',
        'var motorTemp = tempRaw / 10;',
        '',
        'var faults = [regs[50]||0, regs[51]||0, regs[52]||0];',
        'var alarms = [regs[60]||0, regs[61]||0, regs[62]||0];',
        'var hasFault = faults.some(function(v){return v>0;});',
        'var hasAlarm = alarms.some(function(v){return v>0;});',
        '',
        'var states = ["READY","RUNNING","UNDERVOLTAGE","PROTECTION","CONFIG","STO","POWER_OFF","DISABLED"];',
        'var running = stateCode === 1;',
        'var ready = stateCode === 0;',
        'var fault = stateCode === 3 || hasFault;',
        '',
        'devices[' + (idx - 1) + '] = {',
        '    name: "' + name + '",',
        '    type: "SSW900",',
        '    ip: "' + ip + '",',
        '    stateCode: stateCode,',
        '    statusText: states[stateCode] || "UNKNOWN",',
        '    speedRef: 0, motorSpeed: 0, frequency: 0, outputFreq: 0,',
        '    current: current, outputCurrent: current,',
        '    outputVoltage: voltage,',
        '    power: power, cosPhi: cosPhi,',
        '    motorTemp: motorTemp,',
        '    nominalCurrent: 150, nominalVoltage: 500, nominalFreq: 0,',
        '    hoursEnergized: "-", hoursEnabled: "-",',
        '    online: true, running: running, ready: ready, fault: fault,',
        '    hasFault: hasFault, hasAlarm: hasAlarm,',
        '    faultText: hasFault ? "F" + faults.filter(function(v){return v>0;}).join("/F") : "Sin Falla",',
        '    alarmText: hasAlarm ? "A" + alarms.filter(function(v){return v>0;}).join("/A") : "",',
        '    _lastUpdate: Date.now()',
        '};',
        '',
        'global.set("cfwDevices", devices);',
        'node.status({fill:running?"blue":ready?"green":"yellow",shape:"dot",text:states[stateCode]+" "+current+"A"});',
        'return null;'
    ].join('\n');
}

sswDrives.forEach(function(drv) {
    var cfgId = 'weg_mb_cfg_' + drv.idx;
    var readId = 'weg_mb_read_' + drv.idx;
    var parserId = 'weg_d2_parser_ssw' + drv.idx;
    var yPos = 100 + (drv.idx - 1) * 80;

    // Modbus client
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
            reconnectTimeout: '5000',
            parallelUnitIdsAllowed: true,
            showErrors: false,
            showWarnings: true,
            showLogs: false
        });
        console.log('Added Modbus client: ' + drv.name + ' (' + drv.ip + ')');
    }

    // Modbus read
    if (!f.find(function(n){ return n.id === readId; })) {
        f.push({
            id: readId,
            type: 'modbus-read',
            z: 'weg_d2_tab',
            name: 'Read ' + drv.name,
            topic: '',
            showStatusActivities: true,
            logIOActivities: false,
            showErrors: false,
            showWarnings: true,
            unitid: '1',
            dataType: 'HoldingRegister',
            adr: '0',
            quantity: '65',
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
        console.log('Added Modbus read: ' + drv.name);
    }

    // Parser
    if (!f.find(function(n){ return n.id === parserId; })) {
        f.push({
            id: parserId,
            type: 'function',
            z: 'weg_d2_tab',
            name: 'Parse ' + drv.name + ' -> global',
            func: makeSswParserFunc(drv.idx, drv.name, drv.ip),
            outputs: 1,
            x: 480,
            y: yPos,
            wires: [[]]
        });
        console.log('Added parser: ' + drv.name);
    }
});

// Expand cfwDevices array to 7 in splitter and offline check
var splitter = f.find(function(n){ return n.id === 'weg_d2_splitter'; });
if (splitter) {
    // Update to handle 7 devices (4 CFW + 3 SSW)
    splitter.func = [
        'var devices = global.get("cfwDevices") || [];',
        'var outputs = [];',
        'var totalSlots = 7; // 4 CFW + 3 SSW',
        '',
        '// One output per drive card (first 4 outputs for CFW cards)',
        'for (var i = 0; i < 4; i++) {',
        '    var d = devices[i];',
        '    if (d && d.online === true) {',
        '        var allGc = global.get("gaugeConfigPerDrive") || null;',
        '        var gc = allGc ? allGc[i] : null;',
        '        d.gaugeConfig = gc;',
        '        outputs.push({payload: d});',
        '    } else {',
        '        outputs.push({payload: {',
        '            name: "CFW900 #" + (i+1),',
        '            ip: ["192.168.10.100","192.168.10.101","192.168.10.102","192.168.10.103"][i],',
        '            online: false, running: false, ready: false, fault: false,',
        '            hasFault: false, hasAlarm: false,',
        '            current: 0, frequency: 0, outputVoltage: 0, motorSpeed: 0,',
        '            power: 0, cosPhi: 0, motorTemp: 0,',
        '            speedRef: 1800, nominalCurrent: 150, nominalVoltage: 500, nominalFreq: 70,',
        '            faultText: "", alarmText: "",',
        '            hoursEnergized: "-", hoursEnabled: "-", gaugeConfig: null',
        '        }});',
        '    }',
        '}',
        '',
        '// Banner (output 5) - count ALL drives (CFW + SSW)',
        'var onlineCount = 0, runningCount = 0, faultTexts = [];',
        '',
        'for (var j = 0; j < totalSlots; j++) {',
        '    var dev = devices[j];',
        '    if (dev && dev.online === true) {',
        '        onlineCount++;',
        '        if (dev.running) runningCount++;',
        '        if (dev.hasFault) faultTexts.push(dev.name + ": " + dev.faultText);',
        '    }',
        '}',
        'var offlineCount = totalSlots - onlineCount;',
        '',
        'var alertColor, icon, text;',
        'if (faultTexts.length > 0) {',
        '    alertColor = "#ef4444"; icon = "mdi-alert"; text = faultTexts.join(" | ");',
        '} else if (runningCount > 0) {',
        '    alertColor = "#3b82f6"; icon = "mdi-engine"; text = runningCount + "/" + onlineCount + " DRIVES EN MARCHA";',
        '} else if (onlineCount > 0) {',
        '    alertColor = "#22c55e"; icon = "mdi-check-circle"; text = onlineCount + "/" + totalSlots + " DRIVES ONLINE — ESTACION OPERATIVA";',
        '} else {',
        '    alertColor = "#f59e0b"; icon = "mdi-loading"; text = "CONECTANDO...";',
        '}',
        '',
        'outputs.push({payload: {',
        '    text: text, alertColor: alertColor, icon: icon,',
        '    running: runningCount, online: onlineCount,',
        '    faults: faultTexts.length, offline: offlineCount',
        '}});',
        '',
        '// Stats (same as banner)',
        'outputs.push({payload: outputs[4].payload});',
        'return outputs;'
    ].join('\n');
    console.log('Updated splitter for 7 devices');
}

// Update offline check for 7 devices
var offlineCheck = f.find(function(n){ return n.id === 'weg_offline_check'; });
if (offlineCheck) {
    offlineCheck.func = offlineCheck.func.replace('i < 4', 'i < 7');
    offlineCheck.func = offlineCheck.func.replace('[null,null,null,null]', '[null,null,null,null,null,null,null]');
    console.log('Updated offline check for 7 devices');
}

// ============================================================
// PART 2: Dynamic device provisioning from Config page
// ============================================================
// When user adds a new device in the config form, it triggers
// a chain that creates Modbus nodes via Node-RED admin API

// Provisioner function: builds new nodes and fetches current flows
var provId = 'weg_provisioner';
if (!f.find(function(n){ return n.id === provId; })) {
    f.push({
        id: provId,
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Device Provisioner',
        func: [
            '// Receives device info from config handler',
            '// msg.device = {name, type, ip, site, index}',
            'var dev = msg.device;',
            'if (!dev || !dev.ip || !dev.name) return null;',
            '',
            'var idx = dev.index;',
            'var cfgId = "weg_mb_cfg_" + idx;',
            'var readId = "weg_mb_read_" + idx;',
            'var parserId = "weg_d2_parser_" + (dev.type==="SSW900"?"ssw":"cfw") + idx;',
            'var yPos = 100 + (idx - 1) * 80;',
            '',
            '// Build Modbus client node',
            'var mbClient = {',
            '    id: cfgId, type: "modbus-client", name: dev.name,',
            '    clienttype: "tcp", bufferCommands: true,',
            '    stateLogEnabled: false, queueLogEnabled: false, failureLogEnabled: true,',
            '    tcpHost: dev.ip, tcpPort: "502", tcpType: "DEFAULT",',
            '    serialPort: "", serialType: "RTU-BUFFERD",',
            '    serialBaudrate: "9600", serialDatabits: "8",',
            '    serialStopbits: "1", serialParity: "none",',
            '    serialConnectionDelay: "100",',
            '    serialAsciiResponseStartDelimiter: "0x3A",',
            '    unit_id: "1", commandDelay: "1", clientTimeout: "1000",',
            '    reconnectOnTimeout: true, reconnectTimeout: "5000",',
            '    parallelUnitIdsAllowed: true,',
            '    showErrors: false, showWarnings: true, showLogs: false',
            '};',
            '',
            '// Build parser function based on drive type',
            'var parserFunc;',
            'if (dev.type === "SSW900") {',
            '    parserFunc = "var regs=msg.payload;if(!regs||regs.length<30){node.status({fill:\\"red\\",shape:\\"ring\\",text:\\"bad data\\"});return null;}var devices=global.get(\\"cfwDevices\\")||[];var current=(regs[3]||0)/10;var stateCode=regs[6]||0;var voltage=regs[7]||0;var power=(regs[10]||0)/100;var cosRaw=regs[11]||0;if(cosRaw>32767)cosRaw-=65536;var cosPhi=cosRaw/100;var tempRaw=regs[49]||0;if(tempRaw>32767)tempRaw-=65536;var motorTemp=tempRaw/10;var faults=[regs[50]||0,regs[51]||0,regs[52]||0];var hasFault=faults.some(function(v){return v>0;});var running=stateCode===1;var ready=stateCode===0;devices[" + (idx-1) + "]={name:\\"" + dev.name + "\\",type:\\"SSW900\\",ip:\\"" + dev.ip + "\\",stateCode:stateCode,speedRef:0,motorSpeed:0,frequency:0,outputFreq:0,current:current,outputCurrent:current,outputVoltage:voltage,power:power,cosPhi:cosPhi,motorTemp:motorTemp,nominalCurrent:150,nominalVoltage:500,nominalFreq:0,hoursEnergized:\\"-\\",hoursEnabled:\\"-\\",online:true,running:running,ready:ready,fault:stateCode===3||hasFault,hasFault:hasFault,hasAlarm:false,faultText:hasFault?\\"F\\"+faults.filter(function(v){return v>0;}).join(\\"/F\\"):\\"Sin Falla\\",alarmText:\\"\\",_lastUpdate:Date.now()};global.set(\\"cfwDevices\\",devices);node.status({fill:running?\\"blue\\":ready?\\"green\\":\\"yellow\\",shape:\\"dot\\",text:(running?\\"RUNNING\\":\\"READY\\")+\\" \\"+current+\\"A\\"});return null;";',
            '} else {',
            '    parserFunc = "var regs=msg.payload;if(!regs||regs.length<50){node.status({fill:\\"red\\",shape:\\"ring\\",text:\\"bad data\\"});return null;}var devices=global.get(\\"cfwDevices\\")||[];var speedRef=regs[1]||0;var motorSpeed=regs[2]||0;var current=(regs[3]||0)/10;var freq=(regs[5]||0)/10;var stateCode=regs[6]||0;var voltage=regs[7]||0;var power=(regs[10]||0)/100;var cosRaw=regs[11]||0;if(cosRaw>32767)cosRaw-=65536;var cosPhi=cosRaw/100;var tempRaw=regs[49]||0;if(tempRaw>32767)tempRaw-=65536;var motorTemp=tempRaw/10;var faults=[regs[50]||0,regs[51]||0,regs[52]||0,regs[53]||0,regs[54]||0];var hasFault=faults.some(function(v){return v>0;});var running=stateCode===1;var ready=stateCode===0;devices[" + (idx-1) + "]={name:\\"" + dev.name + "\\",type:\\"CFW900\\",ip:\\"" + dev.ip + "\\",stateCode:stateCode,speedRef:speedRef,motorSpeed:motorSpeed,current:current,frequency:freq,outputCurrent:current,outputFreq:freq,outputVoltage:voltage,power:power,cosPhi:cosPhi,motorTemp:motorTemp,nominalCurrent:150,nominalVoltage:500,nominalFreq:70,hoursEnergized:\\"-\\",hoursEnabled:\\"-\\",online:true,running:running,ready:ready,fault:stateCode===3||hasFault,hasFault:hasFault,hasAlarm:false,faultText:hasFault?\\"F\\"+faults.filter(function(v){return v>0;}).join(\\"/F\\"):\\"Sin Falla\\",alarmText:\\"\\",_lastUpdate:Date.now()};global.set(\\"cfwDevices\\",devices);node.status({fill:running?\\"blue\\":ready?\\"green\\":\\"yellow\\",shape:\\"dot\\",text:(running?\\"RUNNING\\":\\"READY\\")+\\" \\"+motorSpeed+\\"rpm\\"});return null;";',
            '}',
            '',
            '// Build read node',
            'var mbRead = {',
            '    id: readId, type: "modbus-read", z: "weg_d2_tab",',
            '    name: "Read " + dev.name, topic: "",',
            '    showStatusActivities: true, logIOActivities: false,',
            '    showErrors: false, showWarnings: true,',
            '    unitid: "1", dataType: "HoldingRegister",',
            '    adr: "0", quantity: dev.type==="SSW900" ? "65" : "70",',
            '    rate: "2", rateUnit: "s",',
            '    delayOnStart: false, startDelayTime: "",',
            '    server: cfgId, useIOFile: false, ioFile: "",',
            '    useIOForPayload: false, emptyMsgOnFail: false,',
            '    x: 220, y: yPos,',
            '    wires: [[parserId], []]',
            '};',
            '',
            '// Build parser node',
            'var parserNode = {',
            '    id: parserId, type: "function", z: "weg_d2_tab",',
            '    name: "Parse " + dev.name + " -> global",',
            '    func: parserFunc,',
            '    outputs: 1, x: 480, y: yPos,',
            '    wires: [[]]',
            '};',
            '',
            '// Store new nodes to add',
            'msg.newNodes = [mbClient, mbRead, parserNode];',
            'msg.url = "http://127.0.0.1:1880/flows";',
            'msg.method = "GET";',
            'msg.headers = {"Content-Type": "application/json"};',
            'node.status({fill:"blue",shape:"dot",text:"Provisioning " + dev.name});',
            'return msg;'
        ].join('\n'),
        outputs: 1,
        x: 700,
        y: 720,
        wires: [['weg_prov_get_flows']]
    });
    console.log('Added provisioner function');
}

// HTTP request to GET current flows
if (!f.find(function(n){ return n.id === 'weg_prov_get_flows'; })) {
    f.push({
        id: 'weg_prov_get_flows',
        type: 'http request',
        z: 'weg_d2_tab',
        name: 'GET /flows',
        method: 'GET',
        ret: 'obj',
        paytoqs: 'ignore',
        url: 'http://127.0.0.1:1880/flows',
        tls: '',
        persist: false,
        proxy: '',
        insecureHTTPParser: false,
        authType: '',
        senderr: false,
        headers: [],
        x: 700,
        y: 760,
        wires: [['weg_prov_merge']]
    });
    console.log('Added GET /flows node');
}

// Merge function: add new nodes to existing flows
if (!f.find(function(n){ return n.id === 'weg_prov_merge'; })) {
    f.push({
        id: 'weg_prov_merge',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Merge new nodes',
        func: [
            'var flows = msg.payload;',
            'if (!Array.isArray(flows)) { node.warn("Invalid flows response"); return null; }',
            'var newNodes = msg.newNodes || [];',
            '',
            '// Check for duplicates',
            'newNodes.forEach(function(nn) {',
            '    var exists = flows.some(function(existing) { return existing.id === nn.id; });',
            '    if (!exists) {',
            '        flows.push(nn);',
            '        node.warn("Adding node: " + nn.id + " (" + nn.name + ")");',
            '    } else {',
            '        node.warn("Node already exists: " + nn.id);',
            '    }',
            '});',
            '',
            'msg.payload = flows;',
            'msg.headers = {',
            '    "Content-Type": "application/json",',
            '    "Node-RED-Deployment-Type": "full"',
            '};',
            'return msg;'
        ].join('\n'),
        outputs: 1,
        x: 700,
        y: 800,
        wires: [['weg_prov_put_flows']]
    });
    console.log('Added merge function');
}

// HTTP request to PUT updated flows (deploy)
if (!f.find(function(n){ return n.id === 'weg_prov_put_flows'; })) {
    f.push({
        id: 'weg_prov_put_flows',
        type: 'http request',
        z: 'weg_d2_tab',
        name: 'PUT /flows (deploy)',
        method: 'PUT',
        ret: 'txt',
        paytoqs: 'ignore',
        url: 'http://127.0.0.1:1880/flows',
        tls: '',
        persist: false,
        proxy: '',
        insecureHTTPParser: false,
        authType: '',
        senderr: true,
        headers: [],
        x: 700,
        y: 840,
        wires: [['weg_prov_status']]
    });
    console.log('Added PUT /flows node');
}

// Status feedback
if (!f.find(function(n){ return n.id === 'weg_prov_status'; })) {
    f.push({
        id: 'weg_prov_status',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Provision Status',
        func: [
            'if (msg.statusCode === 200 || msg.statusCode === 204) {',
            '    node.status({fill:"green",shape:"dot",text:"Deployed OK"});',
            '    node.warn("Device provisioned and deployed successfully");',
            '} else {',
            '    node.status({fill:"red",shape:"ring",text:"Deploy failed: " + msg.statusCode});',
            '    node.warn("Deploy failed: " + msg.statusCode + " " + msg.payload);',
            '}',
            'return null;'
        ].join('\n'),
        outputs: 0,
        x: 700,
        y: 880,
        wires: []
    });
    console.log('Added provision status node');
}

// ============================================================
// PART 3: Update config handler to trigger provisioner
// ============================================================
var handler = f.find(function(n){ return n.id === 'weg_d2_config_handler'; });
if (handler) {
    // Add provisioner output - handler now has 2 outputs
    // Output 1: response to dashboard, Output 2: to provisioner
    var oldFunc = handler.func;

    // Check if already updated
    if (oldFunc.indexOf('provisioner') === -1) {
        // Find the section where new device is added and add provisioner trigger
        handler.func = oldFunc.replace(
            /return msg;/g,
            'return [msg, null];'
        );

        // Add provisioner trigger when action is 'addDevice'
        if (handler.func.indexOf('addDevice') >= 0) {
            handler.func = handler.func.replace(
                "action === 'addDevice'",
                "action === 'addDevice'"
            );
            // Replace the return after addDevice to also send to provisioner
            // We need to find the addDevice block and modify its return
            handler.func = handler.func.replace(
                /if\s*\(\s*action\s*===\s*['"]addDevice['"]\s*\)\s*\{([\s\S]*?)return \[msg, null\];/,
                function(match, block) {
                    return match.replace(
                        'return [msg, null];',
                        '// Trigger provisioner\nvar provMsg = {device: {name: p.name, type: p.type, ip: p.ip, site: p.site, index: deviceList.length}};\nreturn [msg, provMsg];'
                    );
                }
            );
        }

        handler.outputs = 2;
        // Wire output 2 to provisioner
        if (handler.wires && handler.wires.length < 2) {
            handler.wires.push(['weg_provisioner']);
        } else if (handler.wires && handler.wires.length >= 2) {
            handler.wires[1] = ['weg_provisioner'];
        }
        console.log('Updated config handler with provisioner output');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - All 7 drives + dynamic provisioning from config page');
