var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Clean gauge design:
// - 3 fixed zone arcs as background (green/yellow/red segments, semi-transparent)
// - 1 foreground arc showing current value fill (solid, in zone color)
// - No needle, no dots - same style as original but with zone colors

var newSvg = [
    '<!-- GAUGES ROW -->',
    '  <div v-if="d.online" style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:10px 8px 4px;text-align:center">',
    '    <div v-for="g in gauges" :key="g.label">',
    '      <div style="font-size:0.7em;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">{{g.label}}</div>',
    '      <svg viewBox="0 0 100 56" :width="140" :height="78">',
    '        <!-- Fixed zone background arcs -->',
    '        <path v-for="(z, zi) in g.zones" :key="\'z\'+zi" :d="zoneArc(z.start, z.end)" fill="none" :stroke="z.color" stroke-width="6" opacity="0.25"/>',
    '        <!-- Current value fill arc -->',
    '        <path v-if="g.pct>0" :d="fillArc(g.pct)" fill="none" :stroke="g.arcColor" stroke-width="6" stroke-linecap="round"/>',
    '        <!-- Value text -->',
    '        <text x="50" y="42" text-anchor="middle" fill="#1a1a2e" font-size="18" font-weight="700" font-family="monospace">{{g.value}}</text>',
    '        <text x="50" y="53" text-anchor="middle" fill="#999" font-size="11" font-family="monospace">{{g.unit}}</text>',
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
    '      var defs = {',
    '        velocidad: {min:0,max:1800,green:1200,yellow:1500,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        corriente: {min:0,max:150,green:80,yellow:120,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        tension:   {min:0,max:500,green:380,yellow:480,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},',
    '        frecuencia:{min:0,max:70,green:50,yellow:62,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}',
    '      };',
    '      function zones(key) {',
    '        var c = gc[key] || defs[key];',
    '        var r = c.max - c.min; if(r<=0) r=1;',
    '        return [',
    '          {start:0, end:(c.green-c.min)/r, color:c.c1||"#22c55e"},',
    '          {start:(c.green-c.min)/r, end:(c.yellow-c.min)/r, color:c.c2||"#f59e0b"},',
    '          {start:(c.yellow-c.min)/r, end:1, color:c.c3||"#ef4444"}',
    '        ];',
    '      }',
    '      function zColor(val, key) {',
    '        var c = gc[key] || defs[key];',
    '        if(val<=c.green) return c.c1||"#22c55e";',
    '        if(val<=c.yellow) return c.c2||"#f59e0b";',
    '        return c.c3||"#ef4444";',
    '      }',
    '      function pct(val, key) {',
    '        var c = gc[key] || defs[key];',
    '        var r = c.max - c.min; if(r<=0) r=1;',
    '        return Math.max(0, Math.min((val-c.min)/r*100, 100));',
    '      }',
    '      return [',
    '        {label:"Velocidad", value:d.motorSpeed, unit:"RPM", pct:pct(d.motorSpeed,"velocidad"), zones:zones("velocidad"), arcColor:zColor(d.motorSpeed,"velocidad")},',
    '        {label:"Corriente", value:d.current?.toFixed(1)||"0", unit:"A", pct:pct(d.current,"corriente"), zones:zones("corriente"), arcColor:zColor(d.current,"corriente")},',
    '        {label:"Tension", value:d.outputVoltage, unit:"V", pct:pct(d.outputVoltage,"tension"), zones:zones("tension"), arcColor:zColor(d.outputVoltage,"tension")},',
    '        {label:"Frecuencia", value:d.frequency?.toFixed(1)||"0", unit:"Hz", pct:pct(d.frequency,"frecuencia"), zones:zones("frecuencia"), arcColor:zColor(d.frequency,"frecuencia")}',
    '      ];',
    '    }',
    '  },',
    '  methods: {',
    '    arcPt(p) {',
    '      // Point on semicircle: center(50,50) radius 40, p=0 left, p=1 right',
    '      var a = Math.PI * (1 - p);',
    '      return { x: 50 + 40 * Math.cos(a), y: 50 - 40 * Math.sin(a) };',
    '    },',
    '    zoneArc(p1, p2) {',
    '      p1 = Math.max(0, Math.min(p1, 1));',
    '      p2 = Math.max(p1 + 0.001, Math.min(p2, 1));',
    '      var s = this.arcPt(p1), e = this.arcPt(p2);',
    '      var large = (p2 - p1) > 0.5 ? 1 : 0;',
    '      return "M " + s.x.toFixed(1) + " " + s.y.toFixed(1) + " A 40 40 0 " + large + " 1 " + e.x.toFixed(1) + " " + e.y.toFixed(1);',
    '    },',
    '    fillArc(pct) {',
    '      var p = Math.max(0, Math.min(pct / 100, 1));',
    '      if (p < 0.01) return "";',
    '      var e = this.arcPt(p);',
    '      var large = p > 0.5 ? 1 : 0;',
    '      return "M 10 50 A 40 40 0 " + large + " 1 " + e.x.toFixed(1) + " " + e.y.toFixed(1);',
    '    }',
    '  }',
    '}',
    '</script>'
].join('\n');

for (var i = 1; i <= 4; i++) {
    var card = f.find(function(n) { return n.id === 'weg_d2_card_' + i; });
    if (!card) continue;

    // Replace gauge SVG section
    card.format = card.format.replace(
        /<!-- GAUGES ROW -->[\s\S]*?<\/div>\s*<\/div>/,
        newSvg
    );

    // Replace entire script
    card.format = card.format.replace(
        /<script>[\s\S]*<\/script>/,
        newScript
    );

    console.log('Card ' + i + ' updated');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - clean gauges with fixed zone backgrounds + fill arc');
