var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var form = f.find(function(n) { return n.id === 'weg_d2_config_form'; });
if (!form) { console.log('Form not found'); process.exit(1); }

// Add v-if to hide Velocidad and Frecuencia for SSW type
form.format = form.format.replace(
    '<div v-for="(cfg, key) in dr.config" :key="key" style="margin-bottom:10px">',
    '<div v-for="(cfg, key) in dr.config" :key="key" style="margin-bottom:10px" v-show="!(dr.type===\'SSW900\' && (key===\'velocidad\' || key===\'frecuencia\'))">'
);

console.log('Hidden velocidad + frecuencia for SSW900 type');
fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
