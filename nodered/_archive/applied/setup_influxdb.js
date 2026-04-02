var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var INFLUX_TOKEN = 'HWS-AhZbFYzlY-k3SUP9sY0ygF0t6-wKl36_g8WTls8fX9b4jfJAkPo4Oayimq5Fq3HMMg2OW7BOuV1oBNCegg==';
var INFLUX_URL = 'http://projects-influxdb-1:8086';
var INFLUX_ORG = 'tecnoelectric';
var INFLUX_BUCKET = 'weg_drives';

// 1. Add InfluxDB config node
if (!f.find(function(n){return n.id==='weg_influx_cfg'})) {
    f.push({
        id: 'weg_influx_cfg',
        type: 'influxdb',
        hostname: INFLUX_URL,
        port: '',
        protocol: 'https',
        database: INFLUX_BUCKET,
        name: 'InfluxDB WEG',
        usetls: false,
        tls: '',
        influxdbVersion: '2.0',
        url: INFLUX_URL,
        rejectUnauthorized: false,
        apiVersion: '2.0',
        dbVersion: '2.0',
        token: INFLUX_TOKEN,
        org: INFLUX_ORG,
        bucket: INFLUX_BUCKET
    });
    console.log('Added InfluxDB config node');
}

// 2. Add function node that formats drive data for InfluxDB
if (!f.find(function(n){return n.id==='weg_influx_fmt'})) {
    f.push({
        id: 'weg_influx_fmt',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Format for InfluxDB',
        func: [
            '// Read all drive data and format as InfluxDB points',
            'var devices = global.get("cfwDevices") || [];',
            'var msgs = [];',
            '',
            'for (var i = 0; i < devices.length; i++) {',
            '    var d = devices[i];',
            '    if (!d || !d.online) continue;',
            '',
            '    msgs.push({',
            '        measurement: "drive_data",',
            '        tags: {',
            '            name: d.name,',
            '            ip: d.ip,',
            '            index: String(i)',
            '        },',
            '        fields: {',
            '            motor_speed: d.motorSpeed || 0,',
            '            current: d.current || 0,',
            '            voltage: d.outputVoltage || 0,',
            '            frequency: d.frequency || 0,',
            '            power: d.power || 0,',
            '            cos_phi: d.cosPhi || 0,',
            '            motor_temp: d.motorTemp || 0,',
            '            motor_torque: d.motorTorque || 0,',
            '            speed_ref: d.speedRef || 0,',
            '            running: d.running ? 1 : 0,',
            '            fault: d.hasFault ? 1 : 0,',
            '            state_code: d.stateCode || 0',
            '        }',
            '    });',
            '}',
            '',
            'if (msgs.length === 0) return null;',
            'msg.payload = msgs;',
            'return msg;'
        ].join('\n'),
        outputs: 1,
        x: 450,
        y: 620,
        wires: [['weg_influx_out']]
    });
    console.log('Added InfluxDB formatter');
}

// 3. Add InfluxDB output node
if (!f.find(function(n){return n.id==='weg_influx_out'})) {
    f.push({
        id: 'weg_influx_out',
        type: 'influxdb batch',
        z: 'weg_d2_tab',
        influxdb: 'weg_influx_cfg',
        precision: 's',
        retentionPolicy: '',
        name: 'Write to InfluxDB',
        database: '',
        precisionV18FluxV20: 's',
        retentionPolicyV18Flux: '',
        org: INFLUX_ORG,
        bucket: INFLUX_BUCKET,
        x: 700,
        y: 620,
        wires: [[]]
    });
    console.log('Added InfluxDB output node');
}

// 4. Add inject node to trigger InfluxDB write every 10 seconds
if (!f.find(function(n){return n.id==='weg_influx_tick'})) {
    f.push({
        id: 'weg_influx_tick',
        type: 'inject',
        z: 'weg_d2_tab',
        name: 'InfluxDB 10s',
        repeat: '10',
        once: true,
        onceDelay: '15',
        topic: '',
        props: [],
        x: 220,
        y: 620,
        wires: [['weg_influx_fmt']]
    });
    console.log('Added InfluxDB tick (10s)');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - InfluxDB pipeline: tick(10s) → format → write');
