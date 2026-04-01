const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// 1. Make the group full width
const grpMain = flows.find(n => n.id === 'weg_ui_group_main');
if (grpMain) {
    grpMain.width = '0'; // 0 = auto full width
    console.log('Set group to full width');
}

// 2. Update template width
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    uiOverview.width = '0'; // auto

    let html = uiOverview.format;

    // Replace the logo section with image placeholder
    const oldLogo = `<div class="S-logo">
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" stroke="#16a34a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div>
      <div>Agriplus</div>
      <div class="S-subtitle">Planta Agriplus — WEG Drive Monitoring</div>
    </div>
  </div>`;

    const newLogo = `<div class="S-logo">
    <img src="/agriplus_logo.png" alt="Agriplus" style="height:44px;object-fit:contain" onerror="this.style.display='none'"/>
    <div>
      <div style="margin-left:4px">Agriplus</div>
      <div class="S-subtitle" style="margin-left:4px">Planta Agriplus — WEG Drive Monitoring</div>
    </div>
  </div>`;

    html = html.replace(oldLogo, newLogo);

    // Make max-width bigger for full screen
    html = html.replace('max-width:1200px', 'max-width:100%');

    uiOverview.format = html;
    console.log('Updated logo and full width');
}

// 3. Also fix the Node-RED dashboard to not constrain width
// Override the dashboard CSS via a hidden style element
let styleNode = flows.find(n => n.id === 'weg_fullwidth_style');
if (!styleNode) {
    flows.push({
        id: 'weg_fullwidth_style',
        type: 'ui_template',
        z: 'weg_flow_tab',
        group: 'weg_ui_group_main',
        name: 'Full Width Override',
        order: 0,
        width: '0',
        height: '1',
        format: `<style>
/* Force full width dashboard */
.nr-dashboard-cardpanel { padding: 0 !important; }
.nr-dashboard-widget { padding: 0 !important; }
md-card { padding: 0 !important; margin: 0 !important; box-shadow: none !important; max-width: 100% !important; }
.nr-dashboard-template { padding: 0 !important; width: 100% !important; }
md-content.md-default-theme { background: #f5f5f8 !important; }
.nr-dashboard-theme .nr-dashboard-widget md-card { background: transparent !important; }
</style>`,
        storeOutMessages: false,
        fwdInMessages: false,
        resendOnRefresh: true,
        templateScope: 'global',
        x: 950,
        y: 140,
        wires: [[]]
    });
    console.log('Added full-width CSS override');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved.');
