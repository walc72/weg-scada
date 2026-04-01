var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Clean gauge: viewBox 100x58, let browser scale proportionally
// 3 explicit zone arcs (no v-for to avoid SVG issues) + fill arc
// Bigger gauges, proper aspect ratio

var newSvg = [
    '<!-- GAUGES ROW -->',
    '  <div v-if="d.online" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:12px 8px 4px;text-align:center">',
    '    <div v-for="g in gauges" :key="g.label">',
    '      <div style="font-size:0.7em;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">{{g.label}}</div>',
    '      <svg viewBox="0 0 100 58" preserveAspectRatio="xMidYMid meet" style="width:100%;max-width:180px;height:auto;display:block;margin:0 auto">',
    '        <!-- Zone 1 (green) -->',
    '        <path :d="zoneArc(g.z1s, g.z1e)" fill="none" :stroke="g.c1" stroke-width="8" opacity="0.3"/>',
    '        <!-- Zone 2 (yellow) -->',
    '        <path :d="zoneArc(g.z2s, g.z2e)" fill="none" :stroke="g.c2" stroke-width="8" opacity="0.3"/>',
    '        <!-- Zone 3 (red) -->',
    '        <path :d="zoneArc(g.z3s, g.z3e)" fill="none" :stroke="g.c3" stroke-width="8" opacity="0.3"/>',
    '        <!-- Current value fill -->',
    '        <path v-if="g.pct>0.5" :d="fillArc(g.pct)" fill="none" :stroke="g.arcColor" stroke-width="8" stroke-linecap="round"/>',
    '        <!-- Value -->',
    '        <text x="50" y="40" text-anchor="middle" fill="#1a1a2e" font-size="17" font-weight="700" font-family="monospace">{{g.value}}</text>',
    '        <text x="50" y="53" text-anchor="middle" fill="#999" font-size="10" font-family="monospace">{{g.unit}}</text>',
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
    '      function g(key, val) {',
    '        var c = gc[key] || defs[key];',
    '        var r = c.max - c.min; if(r<=0) r=1;',
    '        var z1e = (c.green - c.min) / r;',
    '        var z2e = (c.yellow - c.min) / r;',
    '        var color;',
    '        if(val <= c.green) color = c.c1 || "#22c55e";',
    '        else if(val <= c.yellow) color = c.c2 || "#f59e0b";',
    '        else color = c.c3 || "#ef4444";',
    '        var pct = Math.max(0, Math.min((val - c.min) / r * 100, 100));',
    '        return {',
    '          z1s: 0, z1e: z1e, c1: c.c1 || "#22c55e",',
    '          z2s: z1e, z2e: z2e, c2: c.c2 || "#f59e0b",',
    '          z3s: z2e, z3e: 1, c3: c.c3 || "#ef4444",',
    '          pct: pct, arcColor: color',
    '        };',
    '      }',
    '      var v = g("velocidad", d.motorSpeed);',
    '      var a = g("corriente", d.current || 0);',
    '      var t = g("tension", d.outputVoltage || 0);',
    '      var fr = g("frecuencia", d.frequency || 0);',
    '      v.label = "Velocidad"; v.value = d.motorSpeed; v.unit = "RPM";',
    '      a.label = "Corriente"; a.value = (d.current||0).toFixed?d.current.toFixed(1):"0"; a.unit = "A";',
    '      t.label = "Tension"; t.value = d.outputVoltage; t.unit = "V";',
    '      fr.label = "Frecuencia"; fr.value = (d.frequency||0).toFixed?d.frequency.toFixed(1):"0"; fr.unit = "Hz";',
    '      return [v, a, t, fr];',
    '    }',
    '  },',
    '  methods: {',
    '    zoneArc(p1, p2) {',
    '      // Semicircle: center(50,50), radius 40, from left(10,50) to right(90,50)',
    '      p1 = Math.max(0, Math.min(p1, 1));',
    '      p2 = Math.max(0, Math.min(p2, 1));',
    '      if (p2 - p1 < 0.001) return "";',
    '      var a1 = Math.PI * (1 - p1);',
    '      var a2 = Math.PI * (1 - p2);',
    '      var x1 = 50 + 40 * Math.cos(a1);',
    '      var y1 = 50 - 40 * Math.sin(a1);',
    '      var x2 = 50 + 40 * Math.cos(a2);',
    '      var y2 = 50 - 40 * Math.sin(a2);',
    '      var lg = (p2 - p1) > 0.5 ? 1 : 0;',
    '      return "M"+x1.toFixed(2)+","+y1.toFixed(2)+" A40,40 0 "+lg+",1 "+x2.toFixed(2)+","+y2.toFixed(2);',
    '    },',
    '    fillArc(pct) {',
    '      var p = Math.max(0, Math.min(pct / 100, 1));',
    '      if (p < 0.005) return "";',
    '      var a = Math.PI * (1 - p);',
    '      var x = 50 + 40 * Math.cos(a);',
    '      var y = 50 - 40 * Math.sin(a);',
    '      var lg = p > 0.5 ? 1 : 0;',
    '      return "M10,50 A40,40 0 "+lg+",1 "+x.toFixed(2)+","+y.toFixed(2);',
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
console.log('Done');
