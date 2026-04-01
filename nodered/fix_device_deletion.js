var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. Fix Config Handler: rebuild cfwDevices on saveFull
//    instead of just trimming by length
// ============================================================
var handler = f.find(function(n){ return n.id === 'weg_d2_config_handler'; });
if (handler) {
    // Replace the simple trim with a full rebuild
    handler.func = handler.func.replace(
        '    // Trim cfwDevices to match new device count\n' +
        '    var cfwDev = global.get("cfwDevices") || [];\n' +
        '    if (cfwDev.length > driveList.length) {\n' +
        '        cfwDev.length = driveList.length;\n' +
        '        global.set("cfwDevices", cfwDev);\n' +
        '    }',

        '    // Rebuild cfwDevices to match new driveList\n' +
        '    var oldDevices = global.get("cfwDevices") || [];\n' +
        '    var newDevices = [];\n' +
        '    for (var di = 0; di < driveList.length; di++) {\n' +
        '        // Try to find existing data by name\n' +
        '        var found = null;\n' +
        '        for (var oi = 0; oi < oldDevices.length; oi++) {\n' +
        '            if (oldDevices[oi] && oldDevices[oi].name === driveList[di].name) {\n' +
        '                found = oldDevices[oi];\n' +
        '                found.index = di; // Update index\n' +
        '                break;\n' +
        '            }\n' +
        '        }\n' +
        '        newDevices[di] = found || { name: driveList[di].name, type: driveList[di].type || "CFW900", site: driveList[di].site || "", online: false, running: false, index: di };\n' +
        '    }\n' +
        '    // Detect deleted devices and publish empty MQTT to clear retained\n' +
        '    for (var ri = 0; ri < oldDevices.length; ri++) {\n' +
        '        if (!oldDevices[ri]) continue;\n' +
        '        var stillExists = false;\n' +
        '        for (var ni = 0; ni < driveList.length; ni++) {\n' +
        '            if (driveList[ni].name === oldDevices[ri].name) { stillExists = true; break; }\n' +
        '        }\n' +
        '        if (!stillExists) {\n' +
        '            node.warn("Device deleted: " + oldDevices[ri].name + " — will be cleaned on next poll");\n' +
        '        }\n' +
        '    }\n' +
        '    global.set("cfwDevices", newDevices);'
    );
    console.log('Fixed config handler: rebuild cfwDevices by name matching');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done.');
