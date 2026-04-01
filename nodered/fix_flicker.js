const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// 1. Slow down dashboard refresh to 3s to reduce flicker
const inject = flows.find(n => n.id === 'weg_dash_inject');
if (inject) {
    inject.repeat = '3';
    inject.name = 'Dashboard 3s tick';
    console.log('Slowed dashboard refresh to 3s');
}

// 2. Add CSS transition to smooth value changes instead of hard redraws
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    // Add smooth transitions to the existing CSS
    let html = uiOverview.format;
    html = html.replace(
        '.S-mc-v{font-size:22px;',
        '.S-mc-v{font-size:22px;transition:color 0.5s;'
    );
    html = html.replace(
        '.S-badge{font-size:11px;',
        '.S-badge{font-size:11px;transition:background 0.5s;'
    );
    uiOverview.format = html;
    console.log('Added smooth transitions');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved.');
