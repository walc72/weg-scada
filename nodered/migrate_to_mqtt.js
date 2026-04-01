var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));
var before = f.length;

// ============================================================
// 1. Remove ALL Modbus nodes (clients, reads, flex-getters, flex-connectors)
// ============================================================
var modbusTypes = ['modbus-client', 'modbus-read', 'modbus-flex-getter', 'modbus-flex-connector', 'modbus-getter'];
var removedModbus = 0;
f = f.filter(function(n) {
    if (modbusTypes.indexOf(n.type) >= 0) {
        console.log('Removing ' + n.type + ': ' + n.id + ' (' + n.name + ')');
        removedModbus++;
        return false;
    }
    return true;
});
console.log('Removed ' + removedModbus + ' Modbus nodes');

// ============================================================
// 2. Remove old parser function nodes (weg_d2_parser_*)
// ============================================================
var removedParsers = 0;
f = f.filter(function(n) {
    if (n.id && n.id.indexOf('weg_d2_parser_') === 0) {
        console.log('Removing parser: ' + n.id + ' (' + n.name + ')');
        removedParsers++;
        return false;
    }
    return true;
});
console.log('Removed ' + removedParsers + ' parser nodes');

// ============================================================
// 3. Remove old provisioner chain and poll dispatch nodes
// ============================================================
var removeIds = [
    'weg_provisioner', 'weg_prov_exec', 'weg_prov_result',
    'weg_poll_inject', 'weg_poll_dispatch',
    'weg_offline_check', 'weg_offline_tick',
    'weg_flex_1', 'weg_flex_2', 'weg_flex_3', 'weg_flex_4',
    'weg_flex_5', 'weg_flex_6', 'weg_flex_7'
];
f = f.filter(function(n) {
    if (removeIds.indexOf(n.id) >= 0) {
        console.log('Removing: ' + n.id + ' (' + n.name + ')');
        return false;
    }
    return true;
});

// ============================================================
// 4. Remove old InfluxDB write chain (poller writes directly now)
// ============================================================
var influxIds = ['weg_influx_inject', 'weg_influx_fmt', 'weg_influx_http', 'weg_influx_status'];
f = f.filter(function(n) {
    if (influxIds.indexOf(n.id) >= 0) {
        console.log('Removing InfluxDB: ' + n.id + ' (' + n.name + ')');
        return false;
    }
    return true;
});

// ============================================================
// 5. Add MQTT broker config node
// ============================================================
var mqttBrokerId = 'weg_mqtt_broker';
if (!f.find(function(n) { return n.id === mqttBrokerId; })) {
    f.push({
        id: mqttBrokerId,
        type: 'mqtt-broker',
        name: 'WEG Mosquitto',
        broker: 'weg-mosquitto',
        port: '1883',
        clientid: 'nodered-dashboard',
        autoConnect: true,
        usetls: false,
        protocolVersion: '4',
        keepalive: '60',
        cleansession: true,
        autoUnsubscribe: true,
        birthTopic: '',
        closeTopic: '',
        willTopic: '',
        birthQos: '0',
        closeQos: '0',
        willQos: '0',
        birthPayload: '',
        closePayload: '',
        willPayload: '',
        birthMsg: {},
        closeMsg: {},
        willMsg: {},
        sessionExpiry: ''
    });
    console.log('Added MQTT broker config: weg-mosquitto:1883');
}

// ============================================================
// 6. Add MQTT-in node subscribing to weg/drives/+
// ============================================================
var mqttInId = 'weg_mqtt_drives_in';
if (!f.find(function(n) { return n.id === mqttInId; })) {
    f.push({
        id: mqttInId,
        type: 'mqtt in',
        z: 'weg_d2_tab',
        name: 'MQTT Drives',
        topic: 'weg/drives/+',
        qos: '0',
        datatype: 'json',
        broker: mqttBrokerId,
        nl: false,
        rap: true,
        rh: 0,
        inputs: 0,
        x: 120,
        y: 100,
        wires: [['weg_mqtt_bridge']]
    });
    console.log('Added MQTT-in: weg/drives/+');
}

// ============================================================
// 7. Add bridge function: MQTT → global cfwDevices array
// ============================================================
var bridgeId = 'weg_mqtt_bridge';
if (!f.find(function(n) { return n.id === bridgeId; })) {
    f.push({
        id: bridgeId,
        type: 'function',
        z: 'weg_d2_tab',
        name: 'MQTT → Global',
        func: [
            '// MQTT message from poller → store in cfwDevices global array',
            'var data = msg.payload;',
            'if (!data || !data.name) return null;',
            '',
            '// Use the index from the poller (matches config.json order)',
            'var idx = data.index;',
            'if (idx === undefined || idx === null) return null;',
            '',
            'var devices = global.get("cfwDevices") || [];',
            '',
            '// Ensure array is big enough',
            'while (devices.length <= idx) devices.push(null);',
            '',
            'devices[idx] = data;',
            'global.set("cfwDevices", devices);',
            '',
            'return null;'
        ].join('\n'),
        outputs: 1,
        x: 320,
        y: 100,
        wires: [[]]
    });
    console.log('Added MQTT bridge function');
}

// ============================================================
// 8. Add MQTT-in for poller status
// ============================================================
var mqttStatusId = 'weg_mqtt_status_in';
if (!f.find(function(n) { return n.id === mqttStatusId; })) {
    f.push({
        id: mqttStatusId,
        type: 'mqtt in',
        z: 'weg_d2_tab',
        name: 'Poller Status',
        topic: 'weg/status',
        qos: '0',
        datatype: 'json',
        broker: mqttBrokerId,
        nl: false,
        rap: true,
        rh: 0,
        inputs: 0,
        x: 120,
        y: 160,
        wires: [['weg_poller_status_fn']]
    });

    f.push({
        id: 'weg_poller_status_fn',
        type: 'function',
        z: 'weg_d2_tab',
        name: 'Poller Status',
        func: [
            'var s = msg.payload;',
            'node.status({',
            '    fill: s.poller === "online" ? "green" : "red",',
            '    shape: "dot",',
            '    text: s.online + "/" + s.total + " online, " + s.running + " running"',
            '});',
            'return null;'
        ].join('\n'),
        outputs: 0,
        x: 320,
        y: 160,
        wires: []
    });
    console.log('Added poller status monitor');
}

var after = f.length;
console.log('\n=== Migration Summary ===');
console.log('Nodes before: ' + before);
console.log('Nodes after: ' + after);
console.log('Removed: ' + (before - after + 4) + ' (Modbus + parsers + provisioner + InfluxDB)');
console.log('Added: 4 (MQTT broker + MQTT-in drives + bridge + status)');
console.log('');
console.log('The splitter (weg_d2_splitter) still reads from global.get("cfwDevices")');
console.log('The poller publishes to MQTT → bridge writes to cfwDevices → splitter reads it');
console.log('Dashboard cards continue working unchanged.');

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\nDone - Node-RED migrated to MQTT data source');
