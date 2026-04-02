var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var logoB64 = '';
try { logoB64 = fs.readFileSync('/data/public/agriplus.png').toString('base64'); } catch(e) {}

// Create a UI-scoped template that teleports logo + title into #app-bar-title
var teleportId = 'weg_d2_appbar_teleport';
var existing = f.find(function(n) { return n.id === teleportId; });
if (existing) {
    var idx = f.indexOf(existing);
    f.splice(idx, 1);
}

f.push({
    id: teleportId,
    type: 'ui-template',
    z: 'weg_d2_tab',
    group: 'weg_d2_g_banner',
    name: 'AppBar Logo Teleport',
    order: 0,
    width: '1',
    height: '1',
    format: [
        '<template>',
        '  <Teleport v-if="mounted" to="#app-bar-title">',
        '    <div style="display:flex;align-items:center;gap:10px">',
        '      <img src="data:image/png;base64,' + logoB64 + '" alt="Agriplus" style="height:32px;object-fit:contain"/>',
        '      <span style="font-size:1.1em;font-weight:700">Estación de Bombeo</span>',
        '    </div>',
        '  </Teleport>',
        '</template>',
        '<script>',
        'export default {',
        '  data() { return { mounted: false } },',
        '  mounted() { this.mounted = true }',
        '}',
        '</script>'
    ].join('\n'),
    storeOutMessages: false,
    fwdInMessages: false,
    resendOnRefresh: true,
    templateScope: 'widget:ui',
    x: 500, y: 15,
    wires: [[]]
});

// Simplify the page name since the teleport handles branding
var pg = f.find(function(n) { return n.id === 'weg_d2_pg_agri'; });
if (pg) { pg.name = 'Agriplus'; }

console.log('Created appbar teleport with logo');

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
