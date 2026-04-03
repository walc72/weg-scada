var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// ═══ 1. Update card templates to support 4-zone gauges (add low red for tension) ═══
['weg_dash_agri_cards', 'weg_dash_agro_cards'].forEach(function(id) {
  var c = f.find(function(n) { return n.id === id; });
  if (!c) return;

  // Replace the 3-circle SVG with 4-circle version
  c.format = c.format.replace(
    /<circle cx="50" cy="50" r="36" fill="none" :stroke="g\.c1" stroke-width="7" opacity="0\.3" :stroke-dasharray="g\.z1len\+' 226'" stroke-dashoffset="0" transform="rotate\(180,50,50\)" stroke-linecap="butt"\/>\s*<circle cx="50" cy="50" r="36" fill="none" :stroke="g\.c2" stroke-width="7" opacity="0\.3" :stroke-dasharray="g\.z2len\+' 226'" :stroke-dashoffset="'-'\+g\.z1len" transform="rotate\(180,50,50\)" stroke-linecap="butt"\/>\s*<circle cx="50" cy="50" r="36" fill="none" :stroke="g\.c3" stroke-width="7" opacity="0\.3" :stroke-dasharray="g\.z3len\+' 226'" :stroke-dashoffset="'-'\+\(g\.z1len\+g\.z2len\)" transform="rotate\(180,50,50\)" stroke-linecap="butt"\/>/,
    '<circle v-if="g.z0len>0" cx="50" cy="50" r="36" fill="none" :stroke="g.c0||\'#ef4444\'" stroke-width="7" opacity="0.3" :stroke-dasharray="g.z0len+\' 226\'" stroke-dashoffset="0" transform="rotate(180,50,50)" stroke-linecap="butt"/>' +
    '<circle cx="50" cy="50" r="36" fill="none" :stroke="g.c1" stroke-width="7" opacity="0.3" :stroke-dasharray="g.z1len+\' 226\'" :stroke-dashoffset="\'-\'+(g.z0len||0)" transform="rotate(180,50,50)" stroke-linecap="butt"/>' +
    '<circle cx="50" cy="50" r="36" fill="none" :stroke="g.c2" stroke-width="7" opacity="0.3" :stroke-dasharray="g.z2len+\' 226\'" :stroke-dashoffset="\'-\'+((g.z0len||0)+g.z1len)" transform="rotate(180,50,50)" stroke-linecap="butt"/>' +
    '<circle cx="50" cy="50" r="36" fill="none" :stroke="g.c3" stroke-width="7" opacity="0.3" :stroke-dasharray="g.z3len+\' 226\'" :stroke-dashoffset="\'-\'+((g.z0len||0)+g.z1len+g.z2len)" transform="rotate(180,50,50)" stroke-linecap="butt"/>'
  );

  // Replace the gaugesFor mk() function to support 4 zones
  c.format = c.format.replace(
    /function mk\(key, val, label, unit\) \{[\s\S]*?return \{[\s\S]*?\};[\s\S]*?\}/,
    'function mk(key, val, label, unit) {\n' +
    '        var c = defs[key];\n' +
    '        var range = c.max - c.min; if(range<=0) range=1;\n' +
    '        var hasLow = c.redLow !== undefined && c.redLow > c.min;\n' +
    '        var lowPct = hasLow ? (c.redLow - c.min) / range : 0;\n' +
    '        var gPct = (c.green - c.min) / range;\n' +
    '        var yPct = (c.yellow - c.min) / range;\n' +
    '        var vPct = Math.max(0, Math.min((val - c.min) / range, 1));\n' +
    '        var color;\n' +
    '        if (hasLow && val < c.redLow && val > c.min) color = c.c0 || "#ef4444";\n' +
    '        else if (val <= c.green) color = c.c1 || "#22c55e";\n' +
    '        else if (val <= c.yellow) color = c.c2 || "#f59e0b";\n' +
    '        else color = c.c3 || "#ef4444";\n' +
    '        return {\n' +
    '          z0len: lowPct*half, z1len: (gPct-lowPct)*half, z2len:(yPct-gPct)*half, z3len:(1-yPct)*half,\n' +
    '          fillLen: vPct*half,\n' +
    '          c0:c.c0||"#ef4444", c1:c.c1||"#22c55e", c2:c.c2||"#f59e0b", c3:c.c3||"#ef4444",\n' +
    '          arcColor: color,\n' +
    '          label: label,\n' +
    '          value: typeof val==="number"&&val%1!==0 ? val.toFixed(1) : val,\n' +
    '          unit: unit\n' +
    '        };\n' +
    '      }'
  );

  // Update tension defaults to include redLow
  c.format = c.format.replace(
    /tension: gc\.tension \|\| \{min:0,max:500,green:380,yellow:480,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"\}/g,
    'tension: Object.assign({min:0,max:500,redLow:350,green:380,yellow:480,c0:"#ef4444",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}, gc.tension)'
  );

  // Also fix other gauge defaults with Object.assign
  c.format = c.format.replace(
    /velocidad: gc\.velocidad \|\| \{min:0,max:1800,green:1200,yellow:1500,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"\}/g,
    'velocidad: Object.assign({min:0,max:1800,green:1200,yellow:1500,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}, gc.velocidad)'
  );
  c.format = c.format.replace(
    /corriente: gc\.corriente \|\| \{min:0,max:150,green:80,yellow:120,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"\}/g,
    'corriente: Object.assign({min:0,max:150,green:80,yellow:120,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}, gc.corriente)'
  );
  c.format = c.format.replace(
    /frecuencia: gc\.frecuencia \|\| \{min:0,max:70,green:50,yellow:62,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"\}/g,
    'frecuencia: Object.assign({min:0,max:70,green:50,yellow:62,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}, gc.frecuencia)'
  );

  console.log(id + ': updated with 4-zone gauge support');
});

// ═══ 2. Update zones editor to show redLow field for tension ═══
var cfg = f.find(function(n) { return n.id === 'weg_d2_config_form'; });
if (cfg) {
  // Add redLow to tension defaults in zDefaults
  cfg.format = cfg.format.replace(
    /tension:\{min:0,max:500,green:380,yellow:480\}/g,
    'tension:{min:0,max:500,redLow:350,green:380,yellow:480}'
  );

  // Add Rojo Bajo column to the zones table header
  cfg.format = cfg.format.replace(
    /<th style=\\"padding:6px;text-align:center;font-size:11px;color:#22c55e\\">Verde hasta<\/th>/,
    '<th style=\\"padding:6px;text-align:center;font-size:11px;color:#ef4444\\">Rojo Bajo</th><th style=\\"padding:6px;text-align:center;font-size:11px;color:#22c55e\\">Verde hasta</th>'
  );

  // Add redLow input before green input
  cfg.format = cfg.format.replace(
    /<td style=\\"padding:4px;text-align:center\\"><input type=\\"number\\" v-model\.number=\\"zd\.zones\[g\.key\]\.green\\"/,
    '<td style=\\"padding:4px;text-align:center\\"><input v-if=\\"g.key===\'tension\'\\" type=\\"number\\" v-model.number=\\"zd.zones[g.key].redLow\\" style=\\"width:60px;padding:5px;border:1px solid #ef4444;border-radius:4px;text-align:center;background:#fef2f2;font-size:13px\\" /><span v-else style=\\"color:#ccc\\">-</span></td><td style=\\"padding:4px;text-align:center\\"><input type=\\"number\\" v-model.number=\\"zd.zones[g.key].green\\"'
  );

  console.log('Config form: added redLow field for tension');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done: 4-zone gauge with low voltage support');
