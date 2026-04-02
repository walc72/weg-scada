var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var n = f.find(function(x){return x.id==='weg_d2_navstats'});
if (n) {
    n.format = n.format.replace('Estación de Bombeo', 'Monitoreo de Drivers');
    console.log('Banner updated');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
