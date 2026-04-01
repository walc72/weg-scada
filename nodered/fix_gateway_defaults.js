var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var cfgForm = f.find(function(n){ return n.id === 'weg_d2_config_form'; });
if (!cfgForm) { console.log('NOT FOUND'); process.exit(1); }

// Update the default gateways and drives in the data() section
// Replace the gateways array
cfgForm.format = cfgForm.format.replace(
    /gateways: \[[\s\S]*?\],\n      drives:/,
    'gateways: [\n' +
    '        {name:"PLC M241 Agriplus",ip:"192.168.10.50",port:502,site:"Agriplus",protocol:"RTU over TCP",baudrate:"19200"},\n' +
    '        {name:"Gateway Agrocaraya",ip:"192.168.10.210",port:502,site:"Agrocaraya",protocol:"RTU over TCP",baudrate:"9600"}\n' +
    '      ],\n      drives:'
);

// Replace the drives array
cfgForm.format = cfgForm.format.replace(
    /drives:\[[\s\S]*?\]\n    }/,
    'drives:[\n' +
    '        {name:"CFW900 #1",type:"CFW900",ip:"192.168.10.100",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
    '        {name:"CFW900 #2",type:"CFW900",ip:"192.168.10.101",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
    '        {name:"CFW900 #3",type:"CFW900",ip:"192.168.10.102",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
    '        {name:"CFW900 #4",type:"CFW900",ip:"192.168.10.103",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
    '        {name:"SSW900 #1",type:"SSW900",ip:"",site:"Agriplus",connType:"RTU via Gateway",gateway:"PLC M241 Agriplus",slaveId:5,config:cp(def)},\n' +
    '        {name:"SSW900 #2",type:"SSW900",ip:"",site:"Agriplus",connType:"RTU via Gateway",gateway:"PLC M241 Agriplus",slaveId:6,config:cp(def)},\n' +
    '        {name:"SSW900 Agrocaraya",type:"SSW900",ip:"",site:"Agrocaraya",connType:"RTU via Gateway",gateway:"Gateway Agrocaraya",slaveId:1,config:cp(def)}\n' +
    '      ]\n    }'
);

console.log('Updated gateway and drive defaults');

// Also update the static Modbus nodes for SSW900s to reflect correct gateway IPs
// SSW900 #1 and #2 (Agriplus) → PLC M241 at 192.168.10.50
var sswAgri = [
    {cfgId: 'weg_mb_cfg_5', ip: '192.168.10.50', name: 'SSW900 #1 via M241', unitId: '5'},
    {cfgId: 'weg_mb_cfg_6', ip: '192.168.10.50', name: 'SSW900 #2 via M241', unitId: '6'}
];

sswAgri.forEach(function(s) {
    var cfg = f.find(function(n){ return n.id === s.cfgId; });
    if (cfg) {
        cfg.tcpHost = s.ip;
        cfg.name = s.name;
        cfg.unit_id = s.unitId;
        console.log('Updated ' + s.cfgId + ' → ' + s.ip + ':502 unit ' + s.unitId);
    }
});

// SSW900 Agrocaraya → Gateway at 192.168.10.210
var cfgAgro = f.find(function(n){ return n.id === 'weg_mb_cfg_7'; });
if (cfgAgro) {
    cfgAgro.tcpHost = '192.168.10.210';
    cfgAgro.name = 'SSW900 Agrocaraya via GW';
    cfgAgro.unit_id = '1';
    console.log('Updated weg_mb_cfg_7 → 192.168.10.210:502 unit 1');
}

// Update the Modbus read nodes to use correct unit IDs
var reads = [
    {id: 'weg_mb_read_5', unitId: '5'},
    {id: 'weg_mb_read_6', unitId: '6'},
    {id: 'weg_mb_read_7', unitId: '1'}
];
reads.forEach(function(r) {
    var node = f.find(function(n){ return n.id === r.id; });
    if (node) {
        node.unitid = r.unitId;
        console.log('Updated ' + r.id + ' unitid=' + r.unitId);
    }
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
