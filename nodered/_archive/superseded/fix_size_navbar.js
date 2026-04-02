var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Reduce gauge size back to fit in card, keep 2x2 layout
f.forEach(function(n) {
    if (n.name && n.name.includes('Card') && n.type === 'ui-template' && n.format && n.format.includes('arcPath')) {
        // Reduce from 220x122 to 160x90
        n.format = n.format.replace(/:width="220" :height="122"/g, ':width="160" :height="90"');
        // Reduce font back
        n.format = n.format.replace(/font-size="26"/g, 'font-size="20"');
        // Reduce padding
        n.format = n.format.replace(/padding:16px 12px 8px/g, 'padding:10px 8px 4px');
        console.log('Resized:', n.name);
    }
});

// 2. Move header content into the Dashboard 2.0 app bar
// D2 uses ui-base "appBar" property for custom content
// But simpler: override the Agriplus page title via CSS and inject logo into navbar
// We'll use a global ui-template scoped to 'page:style'

// Remove old banner group content and make it minimal
var bannerNode = f.find(function(n) { return n.id === 'weg_d2_banner_new'; });
if (bannerNode) {
    // Keep just the alert, move logo+stats to navbar
    bannerNode.format = '<template>\n' +
        '<v-alert v-if="msg?.payload"\n' +
        '  :type="msg.payload.alertType || \'info\'"\n' +
        '  :icon="msg.payload.icon || \'mdi-information\'"\n' +
        '  variant="tonal" density="compact"\n' +
        '  style="font-family:monospace;font-weight:700;font-size:0.9em;letter-spacing:0.5px">\n' +
        '  {{ msg.payload.text }}\n' +
        '</v-alert>\n' +
        '</template>';
    bannerNode.height = '1';
    console.log('Simplified banner to alert only');
}

// 3. Create a global CSS/navbar override template
var logoB64 = '';
try {
    logoB64 = fs.readFileSync('/data/public/agriplus.png').toString('base64');
} catch(e) {}

// Find or create the navbar override
var navbarId = 'weg_d2_navbar';
var navbar = f.find(function(n) { return n.id === navbarId; });
if (!navbar) {
    navbar = {
        id: navbarId,
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_banner',
        name: 'Navbar Override',
        order: 0,
        width: '1',
        height: '1',
        format: '',
        storeOutMessages: false,
        fwdInMessages: false,
        resendOnRefresh: true,
        templateScope: 'page:style',
        x: 500, y: 40,
        wires: [[]]
    };
    f.push(navbar);
}

// Override the app bar to include logo + stats
// D2 page:style scope injects CSS into the page head
navbar.templateScope = 'page:style';
navbar.format = `
/* Hide default page title text */
.v-app-bar .v-toolbar-title__placeholder {
    display: none !important;
}

/* Inject logo + title via ::before on toolbar */
.v-app-bar .v-toolbar-title::before {
    content: '';
    display: inline-block;
    width: 100px;
    height: 30px;
    background: url('data:image/png;base64,${logoB64}') no-repeat center/contain;
    vertical-align: middle;
    margin-right: 8px;
}

.v-app-bar .v-toolbar-title::after {
    content: 'Estación de Bombeo';
    font-size: 1.1em;
    font-weight: 800;
    color: #333;
    vertical-align: middle;
}

/* Make app bar white with subtle shadow */
.v-app-bar {
    background: white !important;
    border-bottom: 1px solid #e5e7eb !important;
}
.v-app-bar .v-toolbar-title {
    color: #333 !important;
}
`;
console.log('Created navbar CSS override with logo');

// 4. Add a second global template for stats in the navbar (as a widget that renders in nav)
var statsId = 'weg_d2_navstats';
var statsNode = f.find(function(n) { return n.id === statsId; });
if (!statsNode) {
    statsNode = {
        id: statsId,
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_banner',
        name: 'Stats Counter',
        order: 1,
        width: '12',
        height: '1',
        format: '<template>\n' +
            '<div v-if="msg?.payload" style="display:flex;align-items:center;justify-content:flex-end;gap:20px;padding:4px 8px">\n' +
            '  <div style="text-align:center"><div style="font-size:1.5em;font-weight:800;font-family:monospace;color:#3b82f6">{{msg.payload.running || 0}}</div><div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Running</div></div>\n' +
            '  <div style="text-align:center"><div style="font-size:1.5em;font-weight:800;font-family:monospace;color:#22c55e">{{msg.payload.online || 0}}</div><div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Online</div></div>\n' +
            '  <div style="text-align:center"><div style="font-size:1.5em;font-weight:800;font-family:monospace" :style="{color:msg.payload.faults>0?\'#ef4444\':\'#ddd\'}">{{msg.payload.faults || 0}}</div><div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Faults</div></div>\n' +
            '  <div style="text-align:center"><div style="font-size:1.5em;font-weight:800;font-family:monospace;color:#94a3b8">{{msg.payload.offline || 0}}</div><div style="font-size:0.6em;color:#999;font-weight:600;text-transform:uppercase">Offline</div></div>\n' +
            '</div>\n' +
            '</template>',
        storeOutMessages: true,
        fwdInMessages: true,
        resendOnRefresh: true,
        templateScope: 'local',
        x: 700, y: 30,
        wires: [[]]
    };
    f.push(statsNode);
}

// Wire splitter to also send to stats
var splitter = f.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter) {
    // Add stats as output 6
    splitter.outputs = 6;
    splitter.wires[5] = [statsId];
    // Duplicate banner payload to stats
    splitter.func = splitter.func.replace(
        'return outputs;',
        '// Stats (same as banner payload)\noutputs.push({payload: outputs[4].payload});\nreturn outputs;'
    );
    console.log('Added stats output to splitter');
}

// 5. Reduce banner group height
var bannerGrp = f.find(function(n) { return n.id === 'weg_d2_g_banner'; });
if (bannerGrp) {
    bannerGrp.height = '2';
    bannerGrp.name = '';
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - gauges resized + navbar with logo');
