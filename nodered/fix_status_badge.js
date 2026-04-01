var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var template = '<div style="display:flex;align-items:center;justify-content:center;padding:6px">' +
  '<div v-if="msg.payload===\'READY\'" style="background:#16a34a;color:white;padding:10px 20px;border-radius:8px;font-size:1.2em;font-weight:800;letter-spacing:1px;text-align:center;width:100%;box-shadow:0 2px 8px rgba(22,163,74,0.3)">● LISTO</div>' +
  '<div v-else-if="msg.payload===\'RUNNING\'" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;font-size:1.2em;font-weight:800;letter-spacing:1px;text-align:center;width:100%;box-shadow:0 2px 8px rgba(37,99,235,0.3)">⚡ EN MARCHA</div>' +
  '<div v-else-if="msg.payload===\'PROTECTION\'" style="background:#dc2626;color:white;padding:10px 20px;border-radius:8px;font-size:1.2em;font-weight:800;letter-spacing:1px;text-align:center;width:100%;box-shadow:0 2px 8px rgba(220,38,38,0.4);animation:blink 1s infinite">⚠ FALLA</div>' +
  '<div v-else-if="msg.payload===\'POWER OFF\' || msg.payload===\'DISABLED\' || msg.payload===\'UNDERVOLTAGE\' || msg.payload===\'STO\'" style="background:#6b7280;color:white;padding:10px 20px;border-radius:8px;font-size:1.2em;font-weight:800;letter-spacing:1px;text-align:center;width:100%">⏻ PARADO</div>' +
  '<div v-else-if="msg.payload===\'OFFLINE\'" style="background:#e5e7eb;color:#9ca3af;padding:10px 20px;border-radius:8px;font-size:1.2em;font-weight:800;letter-spacing:1px;text-align:center;width:100%">◌ OFFLINE</div>' +
  '<div v-else style="background:#f59e0b;color:white;padding:10px 20px;border-radius:8px;font-size:1.2em;font-weight:800;letter-spacing:1px;text-align:center;width:100%">{{msg.payload}}</div>' +
  '</div>' +
  '<style>@keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}</style>';

var count = 0;
f.forEach(function(n) {
    if (n.type === 'ui-text' && n.name === 'Estado') {
        n.type = 'ui-template';
        n.format = template;
        n.width = '6';
        n.height = '1';
        delete n.label;
        delete n.font;
        delete n.layout;
        count++;
        console.log('Updated:', n.id);
    }
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Updated ' + count + ' status widgets');
