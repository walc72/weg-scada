var fs = require('fs');
var flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// 1. Modbus client config
if (!flows.find(function(n){return n.id==='weg_mb_cfg';})) {
    flows.push({
        id: 'weg_mb_cfg', type: 'modbus-client',
        name: 'CFW900 #1', clienttype: 'tcp',
        bufferCommands: true, stateLogEnabled: false, qdumpLogEnabled: false,
        tcpHost: '192.168.10.100', tcpPort: '502', tcpType: 'DEFAULT',
        serialPort:'', serialType:'RTU-BUFFERED', serialBaudrate:'19200',
        serialDatabits:'8', serialStopbits:'1', serialParity:'none',
        serialConnectionDelay:'100',
        unit_id: '1', commandDelay: '200', clientTimeout: '3000',
        reconnectOnTimeout: true, reconnectTimeout: '5000',
        parallelUnitIdsAllowed: true
    });
    console.log('Created modbus client config');
}

// 2. Modbus read node in D2 tab
if (!flows.find(function(n){return n.id==='weg_mb_read1';})) {
    flows.push({
        id: 'weg_mb_read1', type: 'modbus-read', z: 'weg_d2_tab',
        name: 'Read CFW900 #1', topic: '',
        showStatusActivities: true, logIOActivities: false, showErrors: true,
        unitid: '1', dataType: 'HoldingRegister',
        adr: '0', quantity: '71',
        rate: '2', rateUnit: 's',
        delayOnStart: false, startDelayTime: '',
        server: 'weg_mb_cfg',
        useIOFile: false, ioFile: '', useIOForPayload: false, emptyMsgOnFail: false,
        x: 220, y: 100,
        wires: [['weg_d2_parser_cfw1'], []]
    });
    console.log('Created modbus read -> parser');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Modbus pipeline recreated.');
