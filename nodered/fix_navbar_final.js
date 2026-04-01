var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Rename page for navbar
var pg = f.find(function(n) { return n.id === 'weg_d2_pg_agri'; });
if (pg) { pg.name = 'Agriplus — Estación de Bombeo'; }

// 2. Clean banner group
var bg = f.find(function(n) { return n.id === 'weg_d2_g_banner'; });
if (bg) { bg.name = ''; bg.height = '1'; }

// 3. Hide old banner
var oldBanner = f.find(function(n) { return n.id === 'weg_d2_banner_new'; });
if (oldBanner) { oldBanner.format = '<template><span></span></template>'; oldBanner.height = '1'; oldBanner.width = '1'; }

// 4. Combine alert + stats in single row
var stats = f.find(function(n) { return n.id === 'weg_d2_navstats'; });
if (stats) {
    stats.width = '12';
    stats.height = '1';
    stats.order = 1;
    stats.format = [
        '<template>',
        '<div v-if="msg?.payload" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">',
        '  <v-alert :type="msg.payload.alertType || \'info\'" :icon="msg.payload.icon || \'mdi-information\'" variant="tonal" density="compact" style="font-family:monospace;font-weight:700;font-size:0.85em;letter-spacing:0.5px;flex:1;min-width:280px">{{ msg.payload.text }}</v-alert>',
        '  <div style="display:flex;gap:16px;text-align:center">',
        '    <div>',
        '      <div style="font-size:1.5em;font-weight:800;font-family:monospace;color:#3b82f6">{{msg.payload.running || 0}}</div>',
        '      <div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Running</div>',
        '    </div>',
        '    <div>',
        '      <div style="font-size:1.5em;font-weight:800;font-family:monospace;color:#22c55e">{{msg.payload.online || 0}}</div>',
        '      <div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Online</div>',
        '    </div>',
        '    <div>',
        '      <div style="font-size:1.5em;font-weight:800;font-family:monospace" :style="{color: msg.payload.faults > 0 ? \'#ef4444\' : \'#ddd\'}">{{msg.payload.faults || 0}}</div>',
        '      <div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Faults</div>',
        '    </div>',
        '    <div>',
        '      <div style="font-size:1.5em;font-weight:800;font-family:monospace;color:#94a3b8">{{msg.payload.offline || 0}}</div>',
        '      <div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Offline</div>',
        '    </div>',
        '  </div>',
        '</div>',
        '</template>'
    ].join('\n');
    console.log('Updated stats+alert combined widget');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
