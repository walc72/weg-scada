var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var logoB64 = '';
try { logoB64 = fs.readFileSync('/data/public/agriplus.png').toString('base64'); } catch(e) {}

// D2 uses page:style templateScope to inject CSS into the page
// We can override the toolbar title to show the logo image

// Find or create the style override
var styleId = 'weg_d2_appbar_style';
var styleNode = f.find(function(n) { return n.id === styleId; });
if (!styleNode) {
    styleNode = {
        id: styleId,
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_banner',
        name: 'AppBar Logo CSS',
        order: 0,
        width: '1',
        height: '1',
        format: '',
        storeOutMessages: false,
        fwdInMessages: false,
        resendOnRefresh: true,
        templateScope: 'page:style',
        x: 500, y: 20,
        wires: [[]]
    };
    f.push(styleNode);
}

styleNode.format = [
    '/* Replace navbar text with Agriplus logo */',
    '.v-app-bar .v-toolbar-title {',
    '  overflow: visible !important;',
    '}',
    '.v-app-bar .v-toolbar-title__placeholder {',
    '  font-size: 0 !important;',
    '  visibility: hidden !important;',
    '  position: relative;',
    '}',
    '.v-app-bar .v-toolbar-title__placeholder::after {',
    '  content: "Estación de Bombeo";',
    '  visibility: visible;',
    '  font-size: 16px;',
    '  font-weight: 700;',
    '  color: white;',
    '  position: absolute;',
    '  left: 44px;',
    '  top: 50%;',
    '  transform: translateY(-50%);',
    '  white-space: nowrap;',
    '}',
    '.v-app-bar .v-toolbar-title__placeholder::before {',
    '  content: "";',
    '  visibility: visible;',
    '  display: inline-block;',
    '  width: 40px;',
    '  height: 30px;',
    '  background: url("data:image/png;base64,' + logoB64 + '") no-repeat center/contain;',
    '  position: absolute;',
    '  left: 0;',
    '  top: 50%;',
    '  transform: translateY(-50%);',
    '}',
].join('\n');

console.log('Added logo to navbar via CSS');

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
