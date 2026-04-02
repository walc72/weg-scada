var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Get the base64 logo (already in container)
var logoB64 = '';
try {
    logoB64 = fs.readFileSync('/data/public/agriplus.png').toString('base64');
    console.log('Logo loaded, length:', logoB64.length);
} catch(e) {
    console.log('No logo file, using text only');
}

// 2. Update banner group to include logo
var bannerGrp = f.find(function(n) { return n.id === 'weg_d2_g_banner'; });
if (bannerGrp) {
    bannerGrp.name = '';  // Hide group title, we'll use the template
    bannerGrp.height = '2';
    console.log('Updated banner group');
}

// 3. Replace banner template with logo + alert
var banner = f.find(function(n) { return n.id === 'weg_d2_banner_new'; });
if (banner) {
    banner.height = '2';
    banner.format = '<template>\n' +
        '<div>\n' +
        '  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px 12px">\n' +
        '    <div style="display:flex;align-items:center;gap:12px">\n' +
        (logoB64 ? '      <img src="data:image/png;base64,' + logoB64 + '" alt="Agriplus" style="height:48px;object-fit:contain"/>\n' : '') +
        '      <div>\n' +
        '        <div style="font-size:1.4em;font-weight:800;color:#333">Estación de Bombeo</div>\n' +
        '        <div style="font-size:0.8em;color:#999">WEG Drive Monitoring — Agriplus</div>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '    <div style="display:flex;gap:16px;text-align:center" v-if="msg?.payload">\n' +
        '      <div><div style="font-size:1.6em;font-weight:800;font-family:monospace;color:#3b82f6">{{msg.payload.running || 0}}</div><div style="font-size:0.65em;color:#999;font-weight:600;text-transform:uppercase">Running</div></div>\n' +
        '      <div><div style="font-size:1.6em;font-weight:800;font-family:monospace;color:#22c55e">{{msg.payload.online || 0}}</div><div style="font-size:0.65em;color:#999;font-weight:600;text-transform:uppercase">Online</div></div>\n' +
        '      <div><div style="font-size:1.6em;font-weight:800;font-family:monospace" :style="{color:msg.payload.faults>0?\'#ef4444\':\'#ddd\'}">{{msg.payload.faults || 0}}</div><div style="font-size:0.65em;color:#999;font-weight:600;text-transform:uppercase">Faults</div></div>\n' +
        '      <div><div style="font-size:1.6em;font-weight:800;font-family:monospace;color:#94a3b8">{{msg.payload.offline || 0}}</div><div style="font-size:0.65em;color:#999;font-weight:600;text-transform:uppercase">Offline</div></div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '  <v-alert v-if="msg?.payload"\n' +
        '    :type="msg.payload.alertType || \'info\'"\n' +
        '    :icon="msg.payload.icon || \'mdi-information\'"\n' +
        '    variant="tonal" density="comfortable" prominent\n' +
        '    style="font-family:monospace;font-weight:700;font-size:1em;letter-spacing:0.5px">\n' +
        '    {{ msg.payload.text }}\n' +
        '  </v-alert>\n' +
        '</div>\n' +
        '</template>';
    console.log('Updated banner with logo + counters + alert');
}

// 4. Update splitter to count ALL 7 drives (4 CFW + 2 SSW Agriplus + 1 SSW Agrocaraya = 7 total)
// But user said 6 for Agriplus (4 CFW + 2 SSW)
var splitter = f.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter) {
    // Replace banner section to count 6 total (4 CFW + 2 SSW)
    var code = splitter.func;

    // Find and replace the banner output section
    var bannerStart = code.indexOf('// Banner');
    var returnStart = code.indexOf('return outputs');

    if (bannerStart > 0 && returnStart > 0) {
        var newBannerCode = `// Banner (output 5) - count all 6 drives (4 CFW + 2 SSW)
var onlineCount = 0, runningCount = 0, faultTexts = [];
var totalDrives = 6; // 4 CFW + 2 SSW in Agriplus

for (var j = 0; j < 4; j++) {
    var dev = devices[j];
    if (dev && dev.online === true) {
        onlineCount++;
        if (dev.running) runningCount++;
        if (dev.hasFault) faultTexts.push(dev.name + ': ' + dev.faultText);
    }
}
// SSW900 are RTU only, count as offline for now
var offlineCount = totalDrives - onlineCount;

var alertType, icon, text;
if (faultTexts.length > 0) {
    alertType = 'error'; icon = 'mdi-alert'; text = faultTexts.join(' | ');
} else if (runningCount > 0) {
    alertType = 'info'; icon = 'mdi-engine'; text = runningCount + '/' + onlineCount + ' DRIVES EN MARCHA';
} else if (onlineCount > 0) {
    alertType = 'success'; icon = 'mdi-check-circle'; text = onlineCount + '/' + totalDrives + ' DRIVES ONLINE — ESTACION OPERATIVA';
} else {
    alertType = 'warning'; icon = 'mdi-loading'; text = 'CONECTANDO...';
}

outputs.push({payload: {
    text: text, alertType: alertType, icon: icon,
    running: runningCount, online: onlineCount,
    faults: faultTexts.length, offline: offlineCount
}});

`;
        code = code.substring(0, bannerStart) + newBannerCode + code.substring(returnStart);
        splitter.func = code;
        console.log('Updated splitter banner to count 6 drives');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
