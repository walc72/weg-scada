var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Add a test inject node that fires once to test the report handler
var testId = 'weg_d2_report_test_inject';
var existing = f.find(function(n){return n.id===testId});
if (existing) f.splice(f.indexOf(existing), 1);

f.push({
    id: testId, type: 'inject', z: 'weg_d2_tab',
    name: 'Test Report',
    props: [
        {p:'topic',vt:'str',v:'generateReport'},
        {p:'payload',v:'{"start":"2026-03-25T00:00:00Z","stop":"2026-04-02T00:00:00Z","drives":[],"sites":[]}',vt:'json'}
    ],
    repeat: '',
    once: true,
    onceDelay: '10',
    x: 500, y: 650,
    wires: [['weg_d2_report_handler']]
});

console.log('Added test inject (fires 10s after deploy)');

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
