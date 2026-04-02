const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// The problem: multiple parsers trigger combine multiple times,
// and the ng-repeat sees duplicated data.
// Fix: Remove debounce node, use a single timed inject that reads from flow context

// 1. Remove wires from all parsers to debounce/combine
const parserIds = ['weg_parse_cfw_1', 'weg_parse_cfw_2', 'weg_parse_cfw_3', 'weg_parse_cfw_4'];
parserIds.forEach(id => {
    const p = flows.find(n => n.id === id);
    if (p) {
        p.wires = [[]]; // No output - just store to flow context
        console.log('Disconnected ' + id + ' from combine');
    }
});

// 2. Remove old debounce
const debounce = flows.find(n => n.id === 'weg_dashboard_trigger');
if (debounce) {
    debounce.x = 9999; debounce.y = 9999;
    debounce.wires = [[]];
}

// 3. Create a timed inject (1s) that triggers the combine
let dashInject = flows.find(n => n.id === 'weg_dash_inject');
if (!dashInject) {
    dashInject = {
        id: 'weg_dash_inject',
        type: 'inject',
        z: 'weg_flow_tab',
        name: 'Dashboard 1s tick',
        props: [],
        repeat: '1',
        crontab: '',
        once: true,
        onceDelay: '3',
        topic: '',
        x: 680,
        y: 250,
        wires: [['weg_combine_dashboard']]
    };
    flows.push(dashInject);
    console.log('Created 1s dashboard tick inject');
} else {
    dashInject.wires = [['weg_combine_dashboard']];
}

// 4. Make sure combine also feeds alarm/voltage/csv
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    combine.wires = [['weg_ui_overview', 'weg_alarm_detector', 'weg_voltage_monitor', 'weg_csv_builder']];
    console.log('Wired combine -> overview + alarm + voltage + csv');
}

// 5. Fix: old wires from join node
const joinNode = flows.find(n => n.id === 'weg_join_data');
if (joinNode) {
    joinNode.wires = [[]]; // disconnect old join
    joinNode.x = 9999; joinNode.y = 9999;
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Final fix applied. Restart to apply.');
