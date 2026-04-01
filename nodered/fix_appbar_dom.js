var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var logoB64 = fs.readFileSync('/data/public/agriplus.png').toString('base64');

// Remove old broken teleport
var old = f.find(function(n) { return n.id === 'weg_d2_appbar_teleport'; });
if (old) { f.splice(f.indexOf(old), 1); }
var old2 = f.find(function(n) { return n.id === 'weg_d2_appbar_inject'; });
if (old2) { f.splice(f.indexOf(old2), 1); }

// Create a template that injects into the toolbar via mounted()
var tpl = '<template>\n<div style="display:none"></div>\n</template>\n<script>\n' +
    'export default {\n' +
    '  mounted() {\n' +
    '    setTimeout(() => {\n' +
    '      const titleEl = document.querySelector(".v-toolbar-title__placeholder");\n' +
    '      if (titleEl) {\n' +
    '        titleEl.style.display = "flex";\n' +
    '        titleEl.style.alignItems = "center";\n' +
    '        titleEl.style.gap = "10px";\n' +
    '        titleEl.innerHTML = \'<img src="data:image/png;base64,' + logoB64 + '" style="height:30px;object-fit:contain"/> <span style="font-weight:700;font-size:1.05em">Estación de Bombeo</span>\';\n' +
    '      }\n' +
    '    }, 500);\n' +
    '  }\n' +
    '}\n</script>';

f.push({
    id: 'weg_d2_appbar_dom',
    type: 'ui-template',
    z: 'weg_d2_tab',
    group: 'weg_d2_g_banner',
    name: 'AppBar DOM Inject',
    order: 0, width: '1', height: '1',
    format: tpl,
    storeOutMessages: false, fwdInMessages: false, resendOnRefresh: true,
    templateScope: 'local',
    x: 500, y: 15, wires: [[]]
});

console.log('Created DOM inject template');
fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
