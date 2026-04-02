var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var newName = "Monitoreo de Drivers";

// 1. ui-base (dashboard title)
var base = f.find(function(n){return n.id==='weg_d2_base'});
if (base) {
    base.name = newName;
    console.log('ui-base name → ' + newName);
}

// 2. All function nodes: replace "WEG SCADA" in func code
f.forEach(function(n) {
    if (n.func && n.func.indexOf('WEG SCADA') !== -1) {
        n.func = n.func.replace(/WEG SCADA/g, newName);
        console.log(n.id + ' (' + n.name + ') → func updated');
    }
});

// 3. Grafana dashboard title
var grafanaPath = '/var/lib/grafana/dashboards/weg-overview.json';
// Grafana is in a different container, skip here

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done — Node-RED');
