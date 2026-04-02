var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Replace banner ui-text with ui-template for rich styled banner
var banner = f.find(function(n) { return n.id === 'weg_d2_banner'; });
if (banner) {
    banner.type = 'ui-template';
    banner.width = '12';
    banner.height = '1';
    banner.format = '<template>\n' +
        '<div v-if="msg?.payload" style="display:flex;align-items:center;justify-content:center;padding:4px">\n' +
        '  <div :style="{\n' +
        '    background: msg.payload.includes(\'RUNNING\') ? \'linear-gradient(135deg, #1d4ed8, #3b82f6)\' :\n' +
        '               msg.payload.includes(\'READY\') ? \'linear-gradient(135deg, #15803d, #22c55e)\' :\n' +
        '               msg.payload.includes(\'FALLA\') ? \'linear-gradient(135deg, #b91c1c, #ef4444)\' :\n' +
        '               \'linear-gradient(135deg, #4b5563, #6b7280)\',\n' +
        '    color: \'white\',\n' +
        '    padding: \'14px 24px\',\n' +
        '    borderRadius: \'12px\',\n' +
        '    fontSize: \'1.2em\',\n' +
        '    fontWeight: \'800\',\n' +
        '    letterSpacing: \'1.5px\',\n' +
        '    textAlign: \'center\',\n' +
        '    width: \'100%\',\n' +
        '    fontFamily: \'monospace\',\n' +
        '    boxShadow: msg.payload.includes(\'FALLA\') ? \'0 4px 20px rgba(239,68,68,0.4)\' : \'0 4px 12px rgba(0,0,0,0.15)\'\n' +
        '  }">{{ msg.payload }}</div>\n' +
        '</div>\n' +
        '</template>';
    delete banner.label;
    delete banner.font;
    delete banner.layout;
    delete banner.style;
    console.log('Banner upgraded to colored template');
}

// Also make status badges bigger and more prominent
var splitter = f.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter) {
    // Update banner text to be more descriptive
    splitter.func = splitter.func.replace(
        "bannerText = '● ' + onlineCount + '/4 DRIVES ONLINE — ALL READY'",
        "bannerText = '✅ ' + onlineCount + '/4 DRIVES ONLINE — ESTACIÓN DE BOMBEO OPERATIVA'"
    );
    splitter.func = splitter.func.replace(
        "bannerText = '● ' + runningCount + '/' + onlineCount + ' DRIVES RUNNING'",
        "bannerText = '⚡ ' + runningCount + '/' + onlineCount + ' DRIVES EN MARCHA'"
    );
    splitter.func = splitter.func.replace(
        "bannerText = '○ CONNECTING...'",
        "bannerText = '⏳ CONECTANDO...'"
    );
    console.log('Banner text improved');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
