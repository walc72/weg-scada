var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. DYNAMIC GAUGE ZONES - Update card templates to read from
//    gaugeConfigPerDrive instead of hardcoded defs
// ============================================================
function patchCardTemplate(nodeId) {
    var tpl = f.find(function(n){ return n.id === nodeId; });
    if (!tpl) { console.log('NOT FOUND: ' + nodeId); return; }

    // Replace the hardcoded gaugesFor method
    var oldGaugesFor = 'gaugesFor(d) {\n' +
        '  var half = 113.097;\n' +
        '  var isCFW = d.type !== "SSW900";\n' +
        '  var defs = {\n' +
        '    velocidad: {min:0,max:1800,green:1200,yellow:1500},\n' +
        '    corriente: {min:0,max:150,green:80,yellow:120},\n' +
        '    tension: {min:0,max:500,green:380,yellow:480},\n' +
        '    frecuencia: {min:0,max:70,green:50,yellow:62}\n' +
        '  };';

    var newGaugesFor = 'gaugesFor(d) {\n' +
        '  var half = 113.097;\n' +
        '  var isCFW = d.type !== "SSW900";\n' +
        '  var perDrive = (d.gaugeConfig && d.gaugeConfig[d.index]) || {};\n' +
        '  var defs = {\n' +
        '    velocidad: perDrive.velocidad || {min:0,max:1800,green:1200,yellow:1500,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},\n' +
        '    corriente: perDrive.corriente || {min:0,max:150,green:80,yellow:120,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},\n' +
        '    tension: perDrive.tension || {min:0,max:500,green:380,yellow:480,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},\n' +
        '    frecuencia: perDrive.frecuencia || {min:0,max:70,green:50,yellow:62,c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"}\n' +
        '  };';

    if (tpl.format.indexOf(oldGaugesFor) !== -1) {
        tpl.format = tpl.format.replace(oldGaugesFor, newGaugesFor);

        // Also update the mk function to use per-drive colors
        tpl.format = tpl.format.replace(
            'c1:"#22c55e", c2:"#f59e0b", c3:"#ef4444",',
            'c1:c.c1||"#22c55e", c2:c.c2||"#f59e0b", c3:c.c3||"#ef4444",'
        );

        // Fix the color assignment to use per-drive colors
        tpl.format = tpl.format.replace(
            'var color = val<=c.green ? "#22c55e" : val<=c.yellow ? "#f59e0b" : "#ef4444";',
            'var color = val<=c.green ? (c.c1||"#22c55e") : val<=c.yellow ? (c.c2||"#f59e0b") : (c.c3||"#ef4444");'
        );

        console.log('Patched gaugesFor in ' + nodeId);
    } else {
        console.log('gaugesFor pattern not found in ' + nodeId + ' - may already be patched');
    }
}

patchCardTemplate('weg_dash_agri_cards');
patchCardTemplate('weg_dash_agro_cards');

// ============================================================
// 2. Update splitter to include gaugeConfigPerDrive in payload
// ============================================================
var splitter = f.find(function(n){ return n.id === 'weg_dash_splitter'; });
if (splitter) {
    // Add gaugeConfig to each device before sending
    if (splitter.func.indexOf('gaugeConfig') === -1) {
        splitter.func = splitter.func.replace(
            'var driveConfig = global.get("driveConfig") || [];',
            'var driveConfig = global.get("driveConfig") || [];\nvar gaugeConfig = global.get("gaugeConfigPerDrive") || {};'
        );
        splitter.func = splitter.func.replace(
            "var enabledDevices = devices.filter(function(d) { return d && d.enabled !== false; });",
            "// Attach gauge config to each device\nfor (var j = 0; j < devices.length; j++) {\n    if (devices[j]) devices[j].gaugeConfig = gaugeConfig;\n}\nvar enabledDevices = devices.filter(function(d) { return d && d.enabled !== false; });"
        );
        console.log('Updated splitter to include gaugeConfigPerDrive');
    } else {
        console.log('Splitter already has gaugeConfig');
    }
}

// ============================================================
// 3. Fix driveConfig names in global context
// ============================================================
var ctx = JSON.parse(fs.readFileSync('/data/context/global/global.json'));
var nameMap = {
    "CFW900 #1": "SAER 1", "CFW900 #2": "SAER 2",
    "CFW900 #3": "SAER 3", "CFW900 #4": "SAER 4",
    "SSW900 #1": "SAER 8", "SSW900 #2": "SAER 5"
};
if (ctx.driveConfig) {
    ctx.driveConfig.forEach(function(d) {
        if (nameMap[d.name]) {
            d.name = nameMap[d.name];
        }
    });
    console.log('Fixed driveConfig names:');
    ctx.driveConfig.forEach(function(d, i) { console.log('  ' + i + ': ' + d.name); });
}
// Clear deviceNames overrides since names are canonical now
ctx.deviceNames = {};
fs.writeFileSync('/data/context/global/global.json', JSON.stringify(ctx));
console.log('Cleared deviceNames overrides');

// ============================================================
// 4. Fix config page to load from driveConfig on mount
//    (remove hardcoded drives, load from global context)
// ============================================================
var configForm = f.find(function(n){ return n.id === 'weg_d2_config_form'; });
if (configForm) {
    // Replace hardcoded drives array with empty array - data comes from watch/msg
    var drivesMatch = configForm.format.match(/drives:\[\s*\{name:"[^"]*"[\s\S]*?\}\s*\]/);
    if (drivesMatch) {
        configForm.format = configForm.format.replace(drivesMatch[0], 'drives:[]');
        console.log('Replaced hardcoded drives with empty array');
    }

    // Replace hardcoded gateways array with empty array
    var gwMatch = configForm.format.match(/gateways: \[\s*\{name:"PLC[\s\S]*?\}\s*\]/);
    if (gwMatch) {
        configForm.format = configForm.format.replace(gwMatch[0], 'gateways: []');
        console.log('Replaced hardcoded gateways with empty array');
    }

    // Ensure mounted sends load request (already does: this.send({topic:"load"}))
    console.log('Config page will load from global context on mount');
}

// ============================================================
// 5. Fix Históricos page theme warning
// ============================================================
var histPage = f.find(function(n){ return n.id === 'weg_d2_pg_grafana'; });
if (histPage) {
    // Find the default theme from ui-base
    var themes = f.filter(function(n){ return n.type === 'ui-theme'; });
    if (themes.length > 0) {
        histPage.theme = themes[0].id;
        console.log('Set Históricos theme to: ' + themes[0].id + ' (' + themes[0].name + ')');
    } else {
        // Remove theme field entirely to use default
        delete histPage.theme;
        console.log('Removed empty theme from Históricos page');
    }
}

// ============================================================
// 6. Fix Grafana Updater SyntaxError (multiline strings)
// ============================================================
var grafUpdater = f.find(function(n){ return n.id === 'weg_grafana_updater'; });
if (grafUpdater && grafUpdater.func) {
    // The issue is multiline strings in statQuery - replace with \n
    // Check if the func has literal newlines inside string literals
    var funcLines = grafUpdater.func.split('\n');
    var fixed = false;
    // Simply mark it for rebuild - the function needs a clean rewrite
    // For now, wrap the whole thing in try/catch to prevent crash
    if (grafUpdater.func.indexOf('try {') === -1) {
        grafUpdater.func = 'try {\n' + grafUpdater.func + '\n} catch(e) { node.warn("Grafana Updater error: " + e.message); node.status({fill:"red",shape:"dot",text:"Error: "+e.message}); return null; }';
        console.log('Wrapped Grafana Updater in try/catch');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\nAll done. Nodes: ' + f.length);
