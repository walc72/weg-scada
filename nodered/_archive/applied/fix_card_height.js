var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. Fix height on dynamic card groups (auto-height)
// ============================================================
var fixIds = [
    'weg_d2_g_agri_drives',
    'weg_d2_g_agro_drives'
];
f.forEach(function(n) {
    if (fixIds.indexOf(n.id) >= 0) {
        n.height = '-1';  // D2: -1 = auto/content-based height
        n.width = '24';
        console.log('Fixed group height: ' + n.id + ' (' + n.name + ')');
    }
});

// ============================================================
// 2. Fix height on dynamic card templates
// ============================================================
['weg_dash_agri_cards', 'weg_dash_agro_cards'].forEach(function(id) {
    var node = f.find(function(n) { return n.id === id; });
    if (node) {
        node.height = '-1';  // auto
        node.width = '24';
        console.log('Fixed template height: ' + id + ' (' + node.name + ')');
    }
});

// ============================================================
// 3. Remove old Agrocaraya banner group + SSW900 static card
// ============================================================
var removeOld = ['weg_d2_g_agro', 'weg_agro_banner', 'weg_d2_banner_agro'];
var removed = 0;
f = f.filter(function(n) {
    if (removeOld.indexOf(n.id) >= 0) {
        console.log('Removed old node: ' + n.id + ' (' + (n.name || n.type) + ')');
        removed++;
        return false;
    }
    // Also remove any orphaned nodes referencing deleted groups
    if (n.group === 'weg_d2_g_agro' && n.id !== 'weg_d2_g_agro') {
        console.log('Removed orphan in old agro group: ' + n.id + ' (' + (n.name || n.type) + ')');
        removed++;
        return false;
    }
    return true;
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\nDone. Removed ' + removed + ' old nodes. Fixed heights to auto.');
