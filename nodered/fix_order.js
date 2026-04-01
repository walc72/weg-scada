var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// D2 renders widgets in the order they appear in the JSON array
// within each group. Move status nodes to be RIGHT AFTER their group header.

for (var driveNum = 1; driveNum <= 4; driveNum++) {
    var groupId = 'weg_d2_g_cfw' + driveNum;
    var statusId = 'weg_d2_c' + driveNum + '_status';

    // Find and remove the status node
    var statusNode = null;
    var statusIdx = -1;
    for (var i = 0; i < f.length; i++) {
        if (f[i].id === statusId) {
            statusNode = f[i];
            statusIdx = i;
            break;
        }
    }

    if (!statusNode) continue;

    // Remove from current position
    f.splice(statusIdx, 1);

    // Find the first widget in this group (a gauge)
    var firstWidgetIdx = -1;
    for (var j = 0; j < f.length; j++) {
        if (f[j].group === groupId && f[j].id !== statusId) {
            firstWidgetIdx = j;
            break;
        }
    }

    if (firstWidgetIdx >= 0) {
        // Insert status BEFORE the first gauge
        f.splice(firstWidgetIdx, 0, statusNode);
        console.log('Moved ' + statusId + ' to position ' + firstWidgetIdx + ' (before gauges)');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - status badges moved to top of each group');
