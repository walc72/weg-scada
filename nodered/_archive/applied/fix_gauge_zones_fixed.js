var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// New SVG gauge section with FIXED zone color arcs + position indicator dot
var newSvgSection = [
    '<!-- GAUGES ROW -->',
    '  <div v-if="d.online" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:10px 8px 4px;text-align:center">',
    '    <div v-for="g in gauges" :key="g.label">',
    '      <div style="font-size:0.7em;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">{{g.label}}</div>',
    '      <svg viewBox="0 0 100 60" :width="140" :height="78">',
    '        <!-- Fixed zone arcs (always visible) -->',
    '        <path v-for="(z, zi) in g.zones" :key="\'z\'+zi" :d="segPath(z.start, z.end)" fill="none" :stroke="z.color" stroke-width="7"/>',
    '        <!-- Indicator needle -->',
    '        <line x1="50" y1="52" :x2="needleX(g.pct)" :y2="needleY(g.pct)" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>',
    '        <circle cx="50" cy="52" r="2.5" fill="#1a1a2e"/>',
    '        <!-- Value -->',
    '        <text x="50" y="42" text-anchor="middle" :fill="g.arcColor" font-size="16" font-weight="700" font-family="monospace">{{g.value}}</text>',
    '        <text x="50" y="53" text-anchor="middle" fill="#999" font-size="9" font-family="monospace">{{g.unit}}</text>',
    '      </svg>',
    '    </div>',
    '  </div>'
].join('\n');

// New gauges computed + methods
var newScript = [
    'export default {',
    '  computed: {',
    '    d() {',
    '      return this.msg?.payload || {name:"",ip:"",online:false,running:false,ready:false,fault:false,hasFault:false,hasAlarm:false,current:0,frequency:0,outputVoltage:0,motorSpeed:0,power:0,cosPhi:0,motorTemp:0,speedRef:1800,nominalCurrent:150,nominalVoltage:500,nominalFreq:70,faultText:"",alarmText:"",hoursEnergized:"-",hoursEnabled:"-"};',
    '    },',
    '    gauges() {',
    '      var d = this.d;',
    '      var gc = d.gaugeConfig || {};',
    '      var defs = {',
    '        velocidad: {min:0,max:1800,green:1200,yellow:1500,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        corriente: {min:0,max:150,green:80,yellow:120,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        tension:   {min:0,max:500,green:380,yellow:480,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        frecuencia:{min:0,max:70,green:50,yellow:62,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}',
    '      };',
    '      function mkZones(key) {',
    '        var c = gc[key] || defs[key];',
    '        var range = c.max - c.min; if(range<=0) range=1;',
    '        return [',
    '          {start:0, end:(c.green-c.min)/range, color:c.c1||"#22c55e"},',
    '          {start:(c.green-c.min)/range, end:(c.yellow-c.min)/range, color:c.c2||"#f59e0b"},',
    '          {start:(c.yellow-c.min)/range, end:1, color:c.c3||"#ef4444"}',
    '        ];',
    '      }',
    '      function valColor(val, key) {',
    '        var c = gc[key] || defs[key];',
    '        if(val<=c.green) return c.c1||"#22c55e";',
    '        if(val<=c.yellow) return c.c2||"#f59e0b";',
    '        return c.c3||"#ef4444";',
    '      }',
    '      function pct(val, key) {',
    '        var c = gc[key] || defs[key];',
    '        var range = c.max - c.min; if(range<=0) range=1;',
    '        return Math.max(0, Math.min((val-c.min)/range*100, 100));',
    '      }',
    '      return [',
    '        {label:"Velocidad", value:d.motorSpeed, unit:"RPM", pct:pct(d.motorSpeed,"velocidad"), zones:mkZones("velocidad"), arcColor:valColor(d.motorSpeed,"velocidad")},',
    '        {label:"Corriente", value:d.current?.toFixed(1)||"0", unit:"A", pct:pct(d.current,"corriente"), zones:mkZones("corriente"), arcColor:valColor(d.current,"corriente")},',
    '        {label:"Tension", value:d.outputVoltage, unit:"V", pct:pct(d.outputVoltage,"tension"), zones:mkZones("tension"), arcColor:valColor(d.outputVoltage,"tension")},',
    '        {label:"Frecuencia", value:d.frequency?.toFixed(1)||"0", unit:"Hz", pct:pct(d.frequency,"frecuencia"), zones:mkZones("frecuencia"), arcColor:valColor(d.frequency,"frecuencia")}',
    '      ];',
    '    }',
    '  },',
    '  methods: {',
    '    segPath(p1, p2) {',
    '      p1=Math.max(0,Math.min(p1,1)); p2=Math.max(0,Math.min(p2,1));',
    '      if(p2<=p1) return "";',
    '      var a1=Math.PI*(1-p1), a2=Math.PI*(1-p2);',
    '      var x1=50+40*Math.cos(a1), y1=52-40*Math.sin(a1);',
    '      var x2=50+40*Math.cos(a2), y2=52-40*Math.sin(a2);',
    '      var large=(p2-p1)>0.5?1:0;',
    '      return "M "+x1.toFixed(1)+" "+y1.toFixed(1)+" A 40 40 0 "+large+" 1 "+x2.toFixed(1)+" "+y2.toFixed(1);',
    '    },',
    '    needleX(pct) {',
    '      var p=Math.max(0,Math.min(pct/100,1));',
    '      var a=Math.PI*(1-p);',
    '      return 50+34*Math.cos(a);',
    '    },',
    '    needleY(pct) {',
    '      var p=Math.max(0,Math.min(pct/100,1));',
    '      var a=Math.PI*(1-p);',
    '      return 52-34*Math.sin(a);',
    '    }',
    '  }',
    '}'
].join('\n');

for (var i = 1; i <= 4; i++) {
    var card = f.find(function(n) { return n.id === 'weg_d2_card_' + i; });
    if (!card) continue;

    // Replace the gauges SVG section
    card.format = card.format.replace(
        /<!-- GAUGES ROW -->[\s\S]*?<\/div>\s*<\/div>/,
        newSvgSection
    );

    // Replace the script section
    card.format = card.format.replace(
        /<script>[\s\S]*<\/script>/,
        '<script>\n' + newScript + '\n</script>'
    );

    console.log('Updated card ' + i + ' with fixed zone arcs + needle');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - gauges now show fixed colored zone segments');
