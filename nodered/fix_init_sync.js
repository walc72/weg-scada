var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var initFn = f.find(function(n){ return n.id === 'weg_d2_config_init_fn'; });
if (initFn) {
    // Extract the existing gaugeConfigPerDrive default from the old func
    var match = initFn.func.match(/global\.set\("gaugeConfigPerDrive",\s*(\[[\s\S]*?\])\)/);
    var gaugeDefault = match ? match[1] : '[]';

    initFn.func = [
        'if (!global.get("adminPassword")) global.set("adminPassword", "admin123");',
        '',
        '// Sync cfwDevices with poller-config.json on startup',
        'try {',
        '  var cfg = JSON.parse(require("fs").readFileSync("/data/poller-config.json", "utf8"));',
        '  var devices = global.get("cfwDevices") || [];',
        '  var numDevices = cfg.devices ? cfg.devices.length : 0;',
        '  // Trim cfwDevices to match config length (removes deleted devices)',
        '  if (devices.length > numDevices) {',
        '    devices.length = numDevices;',
        '    node.warn("Trimmed cfwDevices from " + devices.length + " to " + numDevices);',
        '  }',
        '  // Init empty slots with offline placeholders from config',
        '  for (var i = 0; i < numDevices; i++) {',
        '    if (!devices[i]) {',
        '      devices[i] = { name: cfg.devices[i].name, type: cfg.devices[i].type, site: cfg.devices[i].site, online: false, running: false, index: i };',
        '    }',
        '  }',
        '  global.set("cfwDevices", devices);',
        '} catch(e) { node.warn("Config init: " + e.message); }',
        '',
        'if (!global.get("gaugeConfigPerDrive")) global.set("gaugeConfigPerDrive", ' + gaugeDefault + ');',
        'return null;'
    ].join('\n');
    console.log('Updated config init function with cfwDevices sync');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done. Nodes:', f.length);
