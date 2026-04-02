var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Dashboard 2.0 ui-template uses msg directly (no this.)
// Use simple inline Vue 3 approach

var tpl = '<template><div style="padding:4px">' +
'<div v-if="msg?.payload" style="padding:10px 20px;border-radius:10px;font-size:1.15em;font-weight:800;letter-spacing:1px;text-align:center;width:100%" ' +
':style="{' +
'backgroundColor: msg.payload.includes(\'LISTO\') ? \'#16a34a\' : msg.payload.includes(\'MARCHA\') ? \'#2563eb\' : msg.payload.includes(\'FALLA\') ? \'#dc2626\' : msg.payload.includes(\'OFFLINE\') ? \'#e5e7eb\' : \'#6b7280\',' +
'color: msg.payload.includes(\'OFFLINE\') ? \'#9ca3af\' : \'white\',' +
'boxShadow: msg.payload.includes(\'FALLA\') ? \'0 0 16px rgba(220,38,38,0.5)\' : \'0 2px 6px rgba(0,0,0,0.1)\'' +
'}">' +
'{{ msg.payload }}' +
'</div></div></template>';

var count = 0;
f.forEach(function(n) {
    if (n.name === 'Estado') {
        n.type = 'ui-template';
        n.format = tpl;
        n.width = '6';
        n.height = '1';
        delete n.label;
        delete n.font;
        delete n.layout;
        delete n.style;
        count++;
    }
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Updated ' + count + ' badges');
