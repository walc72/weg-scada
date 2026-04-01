const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    let html = uiOverview.format;

    // Fix: Add track by $index to prevent duplicates
    // Also change from msg.cfwDevices to scope variable
    html = html.replace(
        /ng-repeat="d in msg\.cfwDevices"/g,
        'ng-repeat="d in msg.cfwDevices track by $index"'
    );

    html = html.replace(
        /ng-repeat="d in msg\.sswDevices"/g,
        'ng-repeat="d in msg.sswDevices track by $index"'
    );

    // Also ensure storeOutMessages is false to prevent accumulation
    uiOverview.format = html;
    uiOverview.storeOutMessages = false;
    uiOverview.fwdInMessages = false;

    console.log('Added track by $index + disabled store messages');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved.');
