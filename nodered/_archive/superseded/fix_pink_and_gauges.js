var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ===== FIX 1: Banner pink → proper colors =====
// Change splitter to use hex colors instead of Vuetify type names
var splitter = f.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter) {
    // Replace alertType='info' with alertColor='#3b82f6' (blue)
    // Replace all alertType assignments with alertColor using hex colors
    splitter.func = splitter.func
        .replace("var alertType, icon, text;", "var alertColor, icon, text;")
        .replace("alertType = 'error'", "alertColor = '#ef4444'")
        .replace("alertType = 'info'", "alertColor = '#3b82f6'")
        .replace("alertType = 'success'", "alertColor = '#22c55e'")
        .replace("alertType = 'warning'", "alertColor = '#f59e0b'")
        .replace(/alertType: alertType/g, "alertColor: alertColor");
    console.log('Fixed splitter: alertType → alertColor with hex colors');
}

// Change banner template to use :color instead of :type
var nav = f.find(function(n) { return n.id === 'weg_d2_navstats'; });
if (nav) {
    nav.format = nav.format.replace(
        ':type="msg.payload.alertType || \'info\'"',
        ':color="msg.payload.alertColor || \'#3b82f6\'"'
    );
    console.log('Fixed banner: :type → :color');
}

// ===== FIX 2: Gauge colors from zone config =====
// Update all 4 card templates to read gaugeConfig zone colors
var gaugeKeys = ['velocidad', 'corriente', 'tension', 'frecuencia'];

var newGaugesComputed = [
    'gauges() {',
    '      var d = this.d;',
    '      var gc = d.gaugeConfig || {};',
    '      function zoneColor(val, cfg, fallback) {',
    '        if (!cfg) return fallback;',
    '        if (val <= cfg.green) return cfg.c1 || fallback;',
    '        if (val <= cfg.yellow) return cfg.c2 || fallback;',
    '        return cfg.c3 || fallback;',
    '      }',
    '      return [',
    '        {label:"Velocidad", value:d.motorSpeed, unit:"RPM", pct:d.speedRef>0?Math.min(d.motorSpeed/d.speedRef*100,100):0, color:zoneColor(d.motorSpeed, gc.velocidad, "#3b82f6")},',
    '        {label:"Corriente", value:d.current?.toFixed(1)||"0", unit:"A", pct:d.nominalCurrent>0?Math.min(d.current/d.nominalCurrent*100,100):0, color:zoneColor(d.current, gc.corriente, "#06b6d4")},',
    '        {label:"Tension", value:d.outputVoltage, unit:"V", pct:d.nominalVoltage>0?Math.min(d.outputVoltage/d.nominalVoltage*100,100):0, color:zoneColor(d.outputVoltage, gc.tension, "#f59e0b")},',
    '        {label:"Frecuencia", value:d.frequency?.toFixed(1)||"0", unit:"Hz", pct:d.nominalFreq>0?Math.min(d.frequency/d.nominalFreq*100,100):0, color:zoneColor(d.frequency, gc.frecuencia, "#22c55e")}',
    '      ];',
    '    }'
].join('\n');

for (var i = 1; i <= 4; i++) {
    var card = f.find(function(n) { return n.id === 'weg_d2_card_' + i; });
    if (card) {
        // Replace the gauges() computed property
        card.format = card.format.replace(
            /gauges\(\) \{[\s\S]*?return \[[\s\S]*?\];[\s]*\}/,
            newGaugesComputed
        );
        console.log('Fixed card ' + i + ': gauges now use zone colors from config');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - pink replaced with proper colors, gauges use zone config');
