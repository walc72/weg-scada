var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Get logo base64
var logoB64 = '';
try { logoB64 = fs.readFileSync('/data/public/agriplus.png').toString('base64'); } catch(e) {}

// 2. Fix the stats widget to include logo image and remove blank space
var stats = f.find(function(n) { return n.id === 'weg_d2_navstats'; });
if (stats) {
    stats.format = [
        '<template>',
        '<div v-if="msg?.payload">',
        '  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">',
        logoB64 ? '    <img src="data:image/png;base64,' + logoB64 + '" alt="Agriplus" style="height:36px;object-fit:contain"/>' : '',
        '    <v-alert :type="msg.payload.alertType || \'info\'" :icon="msg.payload.icon || \'mdi-information\'" variant="tonal" density="compact" style="font-family:monospace;font-weight:700;font-size:0.85em;letter-spacing:0.5px;flex:1">{{ msg.payload.text }}</v-alert>',
        '    <div style="display:flex;gap:14px;text-align:center;flex-shrink:0">',
        '      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace;color:#3b82f6">{{msg.payload.running || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Running</div></div>',
        '      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace;color:#22c55e">{{msg.payload.online || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Online</div></div>',
        '      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace" :style="{color:msg.payload.faults>0?\'#ef4444\':\'#ddd\'}">{{msg.payload.faults || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Faults</div></div>',
        '      <div><div style="font-size:1.4em;font-weight:800;font-family:monospace;color:#94a3b8">{{msg.payload.offline || 0}}</div><div style="font-size:0.55em;color:#999;font-weight:600;text-transform:uppercase">Offline</div></div>',
        '    </div>',
        '  </div>',
        '</div>',
        '</template>'
    ].join('\n');
    console.log('Added logo image to stats widget');
}

// 3. Hide the old empty banner that creates blank space
var oldBanner = f.find(function(n) { return n.id === 'weg_d2_banner_new'; });
if (oldBanner) {
    // Remove it completely from the flow
    var idx = f.indexOf(oldBanner);
    if (idx >= 0) { f.splice(idx, 1); console.log('Removed old empty banner'); }
}

// 4. Also remove the navbar CSS override that's creating blank space
var navCss = f.find(function(n) { return n.id === 'weg_d2_navbar'; });
if (navCss) {
    var idx2 = f.indexOf(navCss);
    if (idx2 >= 0) { f.splice(idx2, 1); console.log('Removed navbar CSS override'); }
}

// 5. Change gauges back to 4 in a row
f.forEach(function(n) {
    if (n.name && n.name.includes('Card') && n.type === 'ui-template' && n.format && n.format.includes('arcPath')) {
        // Change grid from 2 columns back to 4
        n.format = n.format.replace(/grid-template-columns:repeat\(2,1fr\)/g, 'grid-template-columns:repeat(4,1fr)');
        // Adjust gauge size for 4-col: 160x90 -> 130x72
        n.format = n.format.replace(/:width="160" :height="90"/g, ':width="140" :height="78"');
        n.format = n.format.replace(/font-size="20"/g, 'font-size="18"');
        console.log('4-col gauges:', n.name);
    }
});

// 6. Make banner group minimal height
var bg = f.find(function(n) { return n.id === 'weg_d2_g_banner'; });
if (bg) { bg.height = '1'; }

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
