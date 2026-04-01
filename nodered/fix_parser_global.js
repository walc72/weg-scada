var fs = require('fs');
var flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// 1. Create parser in the D2 tab using GLOBAL context
var parserId = 'weg_d2_parser_cfw1';
var existing = flows.find(function(n) { return n.id === parserId; });
if (!existing) {
    flows.push({
        id: parserId,
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Parse CFW#1 -> global',
        func: 'var stateNames={0:"READY",1:"RUNNING",2:"UNDERVOLTAGE",3:"PROTECTION",4:"CONFIG",5:"STO",6:"POWER OFF",7:"DISABLED"};\nvar stateColors={0:"#22c55e",1:"#3b82f6",2:"#f59e0b",3:"#ef4444",4:"#94a3b8",5:"#f97316",6:"#6b7280",7:"#9ca3af"};\nvar ft={0:"Sin Falla",1:"Sobrecorriente",2:"Sobretension",3:"Falla tierra",4:"Sobretemp IGBT",5:"Sobrecarga motor",6:"Sobretemp drive",7:"Subtension DC",12:"Perdida fase",33:"Subtension",49:"Motor bloqueado",70:"Error comm"};\nvar regs=msg.payload;\nvar d={\n  name:"CFW900 #1",ip:"192.168.10.100",\n  stateCode:regs[6],speedRef:regs[1],motorSpeed:regs[2],\n  outputCurrent:regs[3]/10.0,outputFreq:regs[5]/10.0,\n  outputVoltage:regs[7],outputPower:regs[10]/100.0,\n  cosPhi:(regs[11]>32767?regs[11]-65536:regs[11])/100.0,\n  nominalCurrent:regs[22]/10.0,nominalVoltage:regs[24]/10.0,\n  nominalFreq:regs[40]/10.0,\n  fault1:regs[60]||0,fault2:regs[61]||0,fault3:regs[62]||0,fault4:regs[63]||0,fault5:regs[64]||0,\n  alarm1:regs[50]||0,alarm2:regs[51]||0,alarm3:regs[52]||0,alarm4:regs[53]||0,alarm5:regs[54]||0,\n  secondsEnergized:regs[42],hoursEnergized:(regs[42]/3600).toFixed(1),\n  secondsEnabled:regs[46],hoursEnabled:(regs[46]/3600).toFixed(1),\n  motorTorque:0,motorTemp:global.get("cfwTemp_1")||0,\n  online:true\n};\nd.speedRPM=d.motorSpeed;d.current=d.outputCurrent;\nd.frequency=d.outputFreq;d.power=d.outputPower;\nd.statusText=stateNames[d.stateCode]||"UNKNOWN";\nd.statusColor=stateColors[d.stateCode]||"#94a3b8";\nd.running=d.stateCode===1;d.ready=d.stateCode===0;\nd.fault=d.stateCode===3;d.hasFault=d.fault1>0;\nd.hasAlarm=d.alarm1>0;\nd.faultText=ft[d.fault1]||(d.fault1>0?"Proteccion: "+d.fault1:"Sin Falla");\nd.alarmText=d.alarm1>0?"Alarma: "+d.alarm1:"";\nglobal.set("cfwDevices",[d,null,null,null]);\nreturn null;',
        outputs: 1,
        x: 450,
        y: 100,
        wires: [[]]
    });
    console.log('Created parser in D2 tab with global context');
}

// 2. Wire the modbus read to this new parser
var readCFW = flows.find(function(n) { return n.id === 'weg_read_cfw'; });
if (readCFW) {
    readCFW.wires = [[parserId], []];
    console.log('Wired modbus read -> new parser');
}

// 3. Make sure splitter uses global.get
var splitter = flows.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter && splitter.func.indexOf('global.get') < 0) {
    splitter.func = splitter.func.replace(/flow\.get/g, 'global.get');
    console.log('Fixed splitter to use global.get');
} else if (splitter) {
    console.log('Splitter already uses global.get');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Done.');
