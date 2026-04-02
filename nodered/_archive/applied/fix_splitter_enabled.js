var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var splitter = f.find(function(n){ return n.id === 'weg_dash_splitter'; });
if (splitter) {
    splitter.func = [
        'var devices = global.get("cfwDevices") || [];',
        'var customNames = global.get("deviceNames") || {};',
        'var driveConfig = global.get("driveConfig") || [];',
        '',
        '// Merge custom names and enabled status into devices',
        'for (var i = 0; i < devices.length; i++) {',
        '    if (devices[i] && customNames[i]) {',
        '        devices[i].displayName = customNames[i];',
        '    } else if (devices[i]) {',
        '        devices[i].displayName = devices[i].name;',
        '    }',
        '    // Mark disabled devices from config',
        '    if (devices[i] && driveConfig[i]) {',
        '        devices[i].enabled = driveConfig[i].enabled !== false;',
        '    }',
        '}',
        '',
        '// Filter out disabled devices',
        'var enabledDevices = devices.filter(function(d) { return d && d.enabled !== false; });',
        '',
        'function siteStats(siteName) {',
        '    var total = 0, online = 0, running = 0, faults = 0, faultTexts = [];',
        '    for (var i = 0; i < enabledDevices.length; i++) {',
        '        var d = enabledDevices[i];',
        '        if (!d || d.site !== siteName) continue;',
        '        total++;',
        '        if (d.online) {',
        '            online++;',
        '            if (d.running) running++;',
        '            if (d.hasFault) { faults++; faultTexts.push((d.displayName||d.name) + ": " + d.faultText); }',
        '        }',
        '    }',
        '    var offline = total - online;',
        '    var alertColor, icon, text;',
        '    if (faultTexts.length > 0) {',
        '        alertColor = "#ef4444"; icon = "mdi-alert"; text = faultTexts.join(" | ");',
        '    } else if (running > 0) {',
        '        alertColor = "#3b82f6"; icon = "mdi-engine"; text = running + "/" + online + " DRIVES EN MARCHA";',
        '    } else if (online > 0) {',
        '        alertColor = "#22c55e"; icon = "mdi-check-circle"; text = online + "/" + total + " DRIVES ONLINE";',
        '    } else {',
        '        alertColor = "#f59e0b"; icon = "mdi-loading"; text = "CONECTANDO...";',
        '    }',
        '    return {payload: {text: text, alertColor: alertColor, icon: icon, running: running, online: online, faults: faults, offline: offline}};',
        '}',
        '',
        'var agri = {payload: enabledDevices, site: "Agriplus"};',
        'var agro = {payload: enabledDevices, site: "Agrocaraya"};',
        'var bannerAgri = siteStats("Agriplus");',
        'var bannerAgro = siteStats("Agrocaraya");',
        '',
        '// Outputs: 1=Agriplus cards, 2=Agrocaraya cards, 3=Banner Agriplus, 4=Banner Agrocaraya',
        'return [agri, agro, bannerAgri, bannerAgro];'
    ].join('\n');
    console.log('Updated splitter to filter disabled devices');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done.');
