var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

function patchCard(nodeId) {
    var tpl = f.find(function(n){ return n.id === nodeId; });
    if (!tpl) { console.log('NOT FOUND: ' + nodeId); return; }

    // Replace hardcoded defs with dynamic config lookup
    var oldDefs = '      var defs = {\n' +
        '        velocidad: {min:0,max:1800,green:1200,yellow:1500},\n' +
        '        corriente: {min:0,max:150,green:80,yellow:120},\n' +
        '        tension: {min:0,max:500,green:380,yellow:480},\n' +
        '        frecuencia: {min:0,max:70,green:50,yellow:62}\n' +
        '      };';

    var newDefs = '      var gc = (d.gaugeConfig && d.gaugeConfig[d.index]) || {};\n' +
        '      var defs = {\n' +
        '        velocidad: gc.velocidad || {min:0,max:1800,green:1200,yellow:1500,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},\n' +
        '        corriente: gc.corriente || {min:0,max:150,green:80,yellow:120,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},\n' +
        '        tension: gc.tension || {min:0,max:500,green:380,yellow:480,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},\n' +
        '        frecuencia: gc.frecuencia || {min:0,max:70,green:50,yellow:62,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}\n' +
        '      };';

    if (tpl.format.indexOf(oldDefs) !== -1) {
        tpl.format = tpl.format.replace(oldDefs, newDefs);
        console.log('Replaced defs in ' + nodeId);
    } else {
        console.log('Defs pattern not found in ' + nodeId);
        // Try to find the actual pattern
        var idx = tpl.format.indexOf('var defs = {');
        if (idx !== -1) {
            console.log('Found var defs at position ' + idx);
            console.log(tpl.format.substring(idx, idx+300));
        }
        return;
    }

    // Replace hardcoded colors in mk function
    tpl.format = tpl.format.replace(
        '        var color = val<=c.green ? "#22c55e" : val<=c.yellow ? "#f59e0b" : "#ef4444";',
        '        var color = val<=c.green ? (c.c1||"#22c55e") : val<=c.yellow ? (c.c2||"#f59e0b") : (c.c3||"#ef4444");'
    );

    // Replace hardcoded zone colors in return
    tpl.format = tpl.format.replace(
        '          c1:"#22c55e", c2:"#f59e0b", c3:"#ef4444",',
        '          c1:c.c1||"#22c55e", c2:c.c2||"#f59e0b", c3:c.c3||"#ef4444",'
    );

    console.log('Patched colors in ' + nodeId);
}

patchCard('weg_dash_agri_cards');
patchCard('weg_dash_agro_cards');

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done.');
