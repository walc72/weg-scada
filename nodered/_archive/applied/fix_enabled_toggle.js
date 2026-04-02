var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var tpl = f.find(function(n){ return n.id === 'weg_d2_config_form'; });
if (tpl) {
    // Fix the watch: ensure enabled field exists on loaded drives
    tpl.format = tpl.format.replace(
        'if(v.payload.drives) this.drives=v.payload.drives;',
        'if(v.payload.drives) { v.payload.drives.forEach(function(d){ if(d.enabled===undefined) d.enabled=true; }); this.drives=v.payload.drives; }'
    );

    // Also fix the tab icon color - remove the space before grey
    tpl.format = tpl.format.replace(
        ":color=\"dr.enabled!==false?'':' grey'\"",
        ":color=\"dr.enabled===false?'grey':undefined\""
    );

    console.log('Fixed enabled reactivity and tab color');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done.');
