var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Use <circle> + stroke-dasharray instead of <path> arcs
// This avoids ALL arc deformation issues

var newSvg = [
    '<!-- GAUGES ROW -->',
    '  <div v-if="d.online" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:12px 8px 4px;text-align:center">',
    '    <div v-for="g in gauges" :key="g.label">',
    '      <div style="font-size:0.7em;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">{{g.label}}</div>',
    '      <svg viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet" style="width:100%;max-width:180px;height:auto;display:block;margin:0 auto">',
    '        <!-- Zone 1 background -->',
    '        <circle cx="50" cy="50" r="36" fill="none" :stroke="g.c1" stroke-width="7" opacity="0.3"',
    '          :stroke-dasharray="g.z1len+\' \'+226" stroke-dashoffset="0"',
    '          transform="rotate(180,50,50)" stroke-linecap="butt"/>',
    '        <!-- Zone 2 background -->',
    '        <circle cx="50" cy="50" r="36" fill="none" :stroke="g.c2" stroke-width="7" opacity="0.3"',
    '          :stroke-dasharray="g.z2len+\' \'+226" :stroke-dashoffset="-g.z1len"',
    '          transform="rotate(180,50,50)" stroke-linecap="butt"/>',
    '        <!-- Zone 3 background -->',
    '        <circle cx="50" cy="50" r="36" fill="none" :stroke="g.c3" stroke-width="7" opacity="0.3"',
    '          :stroke-dasharray="g.z3len+\' \'+226" :stroke-dashoffset="-(g.z1len+g.z2len)"',
    '          transform="rotate(180,50,50)" stroke-linecap="butt"/>',
    '        <!-- Current value fill -->',
    '        <circle v-if="g.fillLen>0.5" cx="50" cy="50" r="36" fill="none" :stroke="g.arcColor" stroke-width="7"',
    '          :stroke-dasharray="g.fillLen+\' \'+226" stroke-dashoffset="0"',
    '          transform="rotate(180,50,50)" stroke-linecap="round"/>',
    '        <!-- Value -->',
    '        <text x="50" y="38" text-anchor="middle" fill="#1a1a2e" font-size="17" font-weight="700" font-family="monospace">{{g.value}}</text>',
    '        <text x="50" y="51" text-anchor="middle" fill="#999" font-size="10" font-family="monospace">{{g.unit}}</text>',
    '      </svg>',
    '    </div>',
    '  </div>'
].join('\n');

var newScript = [
    '<script>',
    'export default {',
    '  computed: {',
    '    d() {',
    '      return this.msg?.payload || {name:"",ip:"",online:false,running:false,ready:false,fault:false,hasFault:false,hasAlarm:false,current:0,frequency:0,outputVoltage:0,motorSpeed:0,power:0,cosPhi:0,motorTemp:0,speedRef:1800,nominalCurrent:150,nominalVoltage:500,nominalFreq:70,faultText:"",alarmText:"",hoursEnergized:"-",hoursEnabled:"-"};',
    '    },',
    '    gauges() {',
    '      var d = this.d;',
    '      var gc = d.gaugeConfig || {};',
    '      // half circumference of r=36 circle = PI * 36',
    '      var half = 113.097;',
    '      var defs = {',
    '        velocidad: {min:0,max:1800,green:1200,yellow:1500,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        corriente: {min:0,max:150,green:80,yellow:120,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        tension:   {min:0,max:500,green:380,yellow:480,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        frecuencia:{min:0,max:70,green:50,yellow:62,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}',
    '      };',
    '      function mk(key, val) {',
    '        var c = gc[key] || defs[key];',
    '        var range = c.max - c.min; if(range<=0) range=1;',
    '        var gPct = (c.green - c.min) / range;',
    '        var yPct = (c.yellow - c.min) / range;',
    '        var vPct = Math.max(0, Math.min((val - c.min) / range, 1));',
    '        var color;',
    '        if(val <= c.green) color = c.c1 || "#22c55e";',
    '        else if(val <= c.yellow) color = c.c2 || "#f59e0b";',
    '        else color = c.c3 || "#ef4444";',
    '        return {',
    '          z1len: gPct * half,',
    '          z2len: (yPct - gPct) * half,',
    '          z3len: (1 - yPct) * half,',
    '          fillLen: vPct * half,',
    '          c1: c.c1||"#22c55e", c2: c.c2||"#f59e0b", c3: c.c3||"#ef4444",',
    '          arcColor: color, pct: vPct * 100',
    '        };',
    '      }',
    '      var v = mk("velocidad", d.motorSpeed);',
    '      var a = mk("corriente", d.current || 0);',
    '      var t = mk("tension", d.outputVoltage || 0);',
    '      var fr = mk("frecuencia", d.frequency || 0);',
    '      v.label="Velocidad"; v.value=d.motorSpeed; v.unit="RPM";',
    '      a.label="Corriente"; a.value=(d.current||0).toFixed?d.current.toFixed(1):"0"; a.unit="A";',
    '      t.label="Tension"; t.value=d.outputVoltage; t.unit="V";',
    '      fr.label="Frecuencia"; fr.value=(d.frequency||0).toFixed?d.frequency.toFixed(1):"0"; fr.unit="Hz";',
    '      return [v, a, t, fr];',
    '    }',
    '  }',
    '}',
    '</script>'
].join('\n');

for (var i = 1; i <= 4; i++) {
    var card = f.find(function(n) { return n.id === 'weg_d2_card_' + i; });
    if (!card) continue;

    card.format = card.format.replace(
        /<!-- GAUGES ROW -->[\s\S]*?<\/div>\s*<\/div>/,
        newSvg
    );

    card.format = card.format.replace(
        /<script>[\s\S]*<\/script>/,
        newScript
    );

    console.log('Card ' + i + ' updated');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - circle-based gauges, no arc deformation possible');
