var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var TOKEN = 'HWS-AhZbFYzlY-k3SUP9sY0ygF0t6-wKl36_g8WTls8fX9b4jfJAkPo4Oayimq5Fq3HMMg2OW7BOuV1oBNCegg==';
var URL = 'http://projects-influxdb-1:8086';
var ORG = 'tecnoelectric';
var BUCKET = 'weg_drives';

// Remove old influx nodes
var removeIds = ['weg_influx_cfg', 'weg_influx_out'];
f = f.filter(function(n) { return removeIds.indexOf(n.id) === -1; });

// Update the formatter to output InfluxDB line protocol + use http request
var fmt = f.find(function(n) { return n.id === 'weg_influx_fmt'; });
if (fmt) {
    fmt.name = 'InfluxDB Line Protocol';
    fmt.func = [
        '// Format drive data as InfluxDB line protocol',
        'var devices = global.get("cfwDevices") || [];',
        'var lines = [];',
        'var ts = Date.now() * 1000000; // nanoseconds',
        '',
        'for (var i = 0; i < devices.length; i++) {',
        '    var d = devices[i];',
        '    if (!d || !d.online) continue;',
        '',
        '    // Escape tag values (spaces, commas, equals)',
        '    var name = (d.name || "unknown").replace(/ /g, "\\\\ ").replace(/,/g, "\\\\,").replace(/=/g, "\\\\=");',
        '    var ip = (d.ip || "0.0.0.0").replace(/ /g, "\\\\ ");',
        '',
        '    var fields = [',
        '        "motor_speed=" + (d.motorSpeed || 0) + "i",',
        '        "current=" + (d.current || 0),',
        '        "voltage=" + (d.outputVoltage || 0) + "i",',
        '        "frequency=" + (d.frequency || 0),',
        '        "power=" + (d.power || 0),',
        '        "cos_phi=" + (d.cosPhi || 0),',
        '        "motor_temp=" + (d.motorTemp || 0),',
        '        "running=" + (d.running ? "true" : "false"),',
        '        "state_code=" + (d.stateCode || 0) + "i"',
        '    ].join(",");',
        '',
        '    lines.push("drive_data,name=" + name + ",ip=" + ip + ",index=" + i + " " + fields + " " + ts);',
        '}',
        '',
        'if (lines.length === 0) return null;',
        '',
        'msg.url = "' + URL + '/api/v2/write?org=' + ORG + '&bucket=' + BUCKET + '&precision=ns";',
        'msg.headers = {',
        '    "Authorization": "Token ' + TOKEN + '",',
        '    "Content-Type": "text/plain"',
        '};',
        'msg.payload = lines.join("\\n");',
        'return msg;'
    ].join('\n');
    fmt.wires = [['weg_influx_http']];
    console.log('Updated formatter to line protocol + HTTP');
}

// Add HTTP request node instead of influxdb batch node
if (!f.find(function(n) { return n.id === 'weg_influx_http'; })) {
    f.push({
        id: 'weg_influx_http',
        type: 'http request',
        z: 'weg_d2_tab',
        name: 'Write InfluxDB',
        method: 'POST',
        ret: 'txt',
        paytoqs: 'ignore',
        url: '',
        tls: '',
        persist: true,
        proxy: '',
        insecureHTTPParser: false,
        authType: '',
        senderr: true,
        headers: [],
        x: 700,
        y: 620,
        wires: [['weg_influx_status']]
    });
    console.log('Added HTTP request node');
}

// Add status node to show write status
if (!f.find(function(n) { return n.id === 'weg_influx_status'; })) {
    f.push({
        id: 'weg_influx_status',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'InfluxDB Status',
        func: [
            'if (msg.statusCode === 204) {',
            '    node.status({fill:"green",shape:"dot",text:"OK " + new Date().toLocaleTimeString()});',
            '} else {',
            '    node.status({fill:"red",shape:"ring",text:"ERR " + msg.statusCode + ": " + msg.payload});',
            '    node.warn("InfluxDB write error: " + msg.statusCode + " " + msg.payload);',
            '}',
            'return null;'
        ].join('\n'),
        outputs: 0,
        x: 900,
        y: 620,
        wires: []
    });
    console.log('Added status node');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - InfluxDB write via HTTP request (no credentials needed)');
