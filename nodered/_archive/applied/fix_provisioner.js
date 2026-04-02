var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Fix the provisioner to accept the drives array from config handler
var prov = f.find(function(n){ return n.id === 'weg_provisioner'; });
if (!prov) { console.log('Provisioner not found!'); process.exit(1); }

prov.func = [
    '// Receives from config handler: msg.drives = [{name,type,ip,site,connType,gateway,slaveId,...}]',
    '// Also msg.gateways = [{name,ip,port,...}]',
    'var drives = msg.drives;',
    'var gateways = msg.gateways || [];',
    'if (!drives || !drives.length) { node.status({fill:"yellow",shape:"ring",text:"No drives"}); return null; }',
    '',
    'var newNodes = [];',
    '',
    'drives.forEach(function(dev, i) {',
    '    var idx = i + 1;',
    '    var cfgId = "weg_dyn_cfg_" + idx;',
    '    var readId = "weg_dyn_read_" + idx;',
    '    var parserId = "weg_dyn_parser_" + idx;',
    '    var yPos = 100 + i * 80;',
    '',
    '    // Resolve IP: for RTU via Gateway, use the gateway IP',
    '    var tcpHost = dev.ip || "";',
    '    var unitId = String(dev.slaveId || 1);',
    '    if (dev.connType === "RTU via Gateway" && dev.gateway) {',
    '        var gw = gateways.find(function(g){ return g.name === dev.gateway; });',
    '        if (gw) tcpHost = gw.ip;',
    '    }',
    '',
    '    if (!tcpHost) { node.warn("No IP for " + dev.name + " - skipping"); return; }',
    '',
    '    // Modbus client',
    '    newNodes.push({',
    '        id: cfgId, type: "modbus-client", name: dev.name + " MB",',
    '        clienttype: "tcp", bufferCommands: true,',
    '        stateLogEnabled: false, queueLogEnabled: false, failureLogEnabled: true,',
    '        tcpHost: tcpHost, tcpPort: "502", tcpType: "DEFAULT",',
    '        serialPort: "", serialType: "RTU-BUFFERD",',
    '        serialBaudrate: "9600", serialDatabits: "8",',
    '        serialStopbits: "1", serialParity: "none",',
    '        serialConnectionDelay: "100",',
    '        serialAsciiResponseStartDelimiter: "0x3A",',
    '        unit_id: unitId, commandDelay: "1", clientTimeout: "1000",',
    '        reconnectOnTimeout: true, reconnectTimeout: "5000",',
    '        parallelUnitIdsAllowed: true,',
    '        showErrors: false, showWarnings: true, showLogs: false',
    '    });',
    '',
    '    // Build parser function string',
    '    var isCFW = dev.type !== "SSW900";',
    '    var qty = isCFW ? "70" : "30";',
    '    var minRegs = isCFW ? 50 : 20;',
    '',
    '    var parserLines = [',
    '        "var regs=msg.payload;",',
    '        "if(!regs||regs.length<" + minRegs + "){node.status({fill:\\"red\\",shape:\\"ring\\",text:\\"bad data\\"});return null;}",',
    '        "var devices=global.get(\\"cfwDevices\\")||[];",',
    '        "var current=(regs[3]||0)/10;",',
    '        "var stateCode=regs[6]||0;",',
    '        "var voltage=regs[7]||0;",',
    '        "var power=(regs[10]||0)/100;",',
    '        "var cosRaw=regs[11]||0;if(cosRaw>32767)cosRaw-=65536;var cosPhi=cosRaw/100;",',
    '        "var tempRaw=regs[49]||0;if(tempRaw>32767)tempRaw-=65536;var motorTemp=tempRaw/10;",',
    '        "var faults=[regs[50]||0,regs[51]||0,regs[52]||0];",',
    '        "var hasFault=faults.some(function(v){return v>0;});",',
    '        "var running=stateCode===1;var ready=stateCode===0;",',
    '    ];',
    '',
    '    if (isCFW) {',
    '        parserLines.push(',
    '            "var speedRef=regs[1]||0;var motorSpeed=regs[2]||0;var freq=(regs[5]||0)/10;",',
    '            "devices[" + i + "]={name:\\"" + dev.name + "\\",type:\\"CFW900\\",ip:\\"" + tcpHost + "\\",stateCode:stateCode,speedRef:speedRef,motorSpeed:motorSpeed,current:current,frequency:freq,outputCurrent:current,outputFreq:freq,outputVoltage:voltage,power:power,cosPhi:cosPhi,motorTemp:motorTemp,nominalCurrent:150,nominalVoltage:500,nominalFreq:70,hoursEnergized:\\"-\\",hoursEnabled:\\"-\\",online:true,running:running,ready:ready,fault:stateCode===3||hasFault,hasFault:hasFault,hasAlarm:false,faultText:hasFault?\\"F\\"+faults.filter(function(v){return v>0;}).join(\\"/F\\"):\\"Sin Falla\\",alarmText:\\"\\",_lastUpdate:Date.now()};"',
    '        );',
    '    } else {',
    '        parserLines.push(',
    '            "devices[" + i + "]={name:\\"" + dev.name + "\\",type:\\"SSW900\\",ip:\\"" + tcpHost + "\\",stateCode:stateCode,speedRef:0,motorSpeed:0,frequency:0,outputFreq:0,current:current,outputCurrent:current,outputVoltage:voltage,power:power,cosPhi:cosPhi,motorTemp:motorTemp,nominalCurrent:150,nominalVoltage:500,nominalFreq:0,hoursEnergized:\\"-\\",hoursEnabled:\\"-\\",online:true,running:running,ready:ready,fault:stateCode===3||hasFault,hasFault:hasFault,hasAlarm:false,faultText:hasFault?\\"F\\"+faults.filter(function(v){return v>0;}).join(\\"/F\\"):\\"Sin Falla\\",alarmText:\\"\\",_lastUpdate:Date.now()};"',
    '        );',
    '    }',
    '',
    '    parserLines.push(',
    '        "global.set(\\"cfwDevices\\",devices);",',
    '        "node.status({fill:running?\\"blue\\":ready?\\"green\\":\\"yellow\\",shape:\\"dot\\",text:(running?\\"RUN\\":\\"RDY\\")+\\" \\"+current+\\"A\\"});",',
    '        "return null;"',
    '    );',
    '',
    '    // Modbus read',
    '    newNodes.push({',
    '        id: readId, type: "modbus-read", z: "weg_d2_tab",',
    '        name: "Read " + dev.name, topic: "",',
    '        showStatusActivities: true, logIOActivities: false,',
    '        showErrors: false, showWarnings: true,',
    '        unitid: unitId, dataType: "HoldingRegister",',
    '        adr: "0", quantity: qty,',
    '        rate: "2", rateUnit: "s",',
    '        delayOnStart: false, startDelayTime: "",',
    '        server: cfgId, useIOFile: false, ioFile: "",',
    '        useIOForPayload: false, emptyMsgOnFail: false,',
    '        x: 220, y: yPos,',
    '        wires: [[parserId], []]',
    '    });',
    '',
    '    // Parser',
    '    newNodes.push({',
    '        id: parserId, type: "function", z: "weg_d2_tab",',
    '        name: "Parse " + dev.name,',
    '        func: parserLines.join("\\n"),',
    '        outputs: 1, x: 480, y: yPos,',
    '        wires: [[]]',
    '    });',
    '',
    '    node.warn("Prepared nodes for " + dev.name + " → " + tcpHost + ":502 unit " + unitId);',
    '});',
    '',
    'if (newNodes.length === 0) { node.status({fill:"yellow",shape:"ring",text:"No nodes to create"}); return null; }',
    '',
    'msg.newNodes = newNodes;',
    'msg.headers = {"Content-Type": "application/json"};',
    'node.status({fill:"blue",shape:"dot",text:"Creating " + newNodes.length + " nodes..."});',
    'return msg;'
].join('\n');

console.log('Fixed provisioner function');

// Fix the GET /flows node - make sure it uses the right URL
var getFlows = f.find(function(n){ return n.id === 'weg_prov_get_flows'; });
if (getFlows) {
    getFlows.url = 'http://127.0.0.1:1880/flows';
    getFlows.method = 'GET';
    getFlows.ret = 'obj';
    console.log('Verified GET /flows node');
}

// Fix the merge function to handle duplicate IDs properly
var merge = f.find(function(n){ return n.id === 'weg_prov_merge'; });
if (merge) {
    merge.func = [
        'var flows = msg.payload;',
        'if (!Array.isArray(flows)) {',
        '    node.status({fill:"red",shape:"ring",text:"Bad response from /flows"});',
        '    node.warn("GET /flows returned: " + typeof msg.payload + " - " + JSON.stringify(msg.payload).substring(0,200));',
        '    return null;',
        '}',
        '',
        'var newNodes = msg.newNodes || [];',
        'var added = 0, updated = 0;',
        '',
        'newNodes.forEach(function(nn) {',
        '    var existingIdx = -1;',
        '    for (var i = 0; i < flows.length; i++) {',
        '        if (flows[i].id === nn.id) { existingIdx = i; break; }',
        '    }',
        '    if (existingIdx >= 0) {',
        '        // Update existing node (keep position if already placed)',
        '        var old = flows[existingIdx];',
        '        if (old.x && !nn.x) nn.x = old.x;',
        '        if (old.y && !nn.y) nn.y = old.y;',
        '        flows[existingIdx] = nn;',
        '        updated++;',
        '    } else {',
        '        flows.push(nn);',
        '        added++;',
        '    }',
        '});',
        '',
        'node.warn("Merge: added " + added + ", updated " + updated + " nodes");',
        'node.status({fill:"blue",shape:"dot",text:"Deploying " + (added+updated) + " nodes"});',
        '',
        'msg.payload = flows;',
        'msg.url = "http://127.0.0.1:1880/flows";',
        'msg.method = "PUT";',
        'msg.headers = {',
        '    "Content-Type": "application/json",',
        '    "Node-RED-Deployment-Type": "full"',
        '};',
        'return msg;'
    ].join('\n');
    console.log('Fixed merge function');
}

// Fix PUT /flows node
var putFlows = f.find(function(n){ return n.id === 'weg_prov_put_flows'; });
if (putFlows) {
    putFlows.url = 'http://127.0.0.1:1880/flows';
    putFlows.method = 'PUT';
    putFlows.ret = 'txt';
    putFlows.senderr = true;
    console.log('Verified PUT /flows node');
}

// Fix status node
var status = f.find(function(n){ return n.id === 'weg_prov_status'; });
if (status) {
    status.func = [
        'var sc = msg.statusCode;',
        'if (sc === 200 || sc === 204) {',
        '    node.status({fill:"green",shape:"dot",text:"Deployed OK ✓"});',
        '    node.warn("Provisioning complete! Nodes deployed successfully.");',
        '} else {',
        '    node.status({fill:"red",shape:"ring",text:"FAILED: HTTP " + sc});',
        '    node.warn("Deploy FAILED: HTTP " + sc + " - " + (msg.payload || "").substring(0, 200));',
        '}',
        'return null;'
    ].join('\n');
    console.log('Fixed status node');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - Provisioner fixed');
