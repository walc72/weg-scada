const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Remove all old D2 nodes from previous import to start clean
const oldD2Ids = flows
    .filter(n => n.z === 'weg_d2_tab' || (n.id && n.id.startsWith('weg_d2_')))
    .map(n => n.id);

// Remove old nodes
for (let i = flows.length - 1; i >= 0; i--) {
    if (oldD2Ids.includes(flows[i].id) || oldD2Ids.includes(flows[i].z)) {
        flows.splice(i, 1);
    }
}

// ============================================================
// CONFIG NODES
// ============================================================
if (!flows.find(n => n.id === 'weg_d2_base')) {
    flows.push({ id: 'weg_d2_base', type: 'ui-base', name: 'WEG SCADA', path: '/dashboard', includeClientData: true, acceptsClientConfig: ['ui-notification','ui-control'], showPathInSidebar: false });
}

if (!flows.find(n => n.id === 'weg_d2_theme')) {
    flows.push({ id: 'weg_d2_theme', type: 'ui-theme', name: 'WEG Theme', colors: { surface: '#ffffff', primary: '#16a34a', bgPage: '#f3f4f6', groupBg: '#ffffff', groupOutline: '#e5e7eb' }, sizes: { pagePadding: '12px', groupGap: '12px', groupBorderRadius: '14px', widgetGap: '6px' } });
}

// ============================================================
// PAGES
// ============================================================
const pages = [
    { id: 'weg_d2_pg_agri', name: 'Agriplus', path: '/agriplus', icon: 'mdi-factory', order: 1 },
    { id: 'weg_d2_pg_agro', name: 'Agrocaraya', path: '/agrocaraya', icon: 'mdi-office-building', order: 2 },
    { id: 'weg_d2_pg_trend', name: 'Trending', path: '/trending', icon: 'mdi-chart-line', order: 3 },
];
pages.forEach(p => {
    if (!flows.find(n => n.id === p.id)) {
        flows.push({ id: p.id, type: 'ui-page', name: p.name, ui: 'weg_d2_base', path: p.path, icon: p.icon, layout: 'grid', theme: 'weg_d2_theme', order: p.order });
    }
});

// ============================================================
// GROUPS - Agriplus page
// ============================================================
const agriGroups = [
    { id: 'weg_d2_g_banner', name: 'Estación de Bombeo', page: 'weg_d2_pg_agri', width: '12', height: '1', order: 0 },
];
// CFW groups
for (let i = 1; i <= 4; i++) {
    agriGroups.push({ id: 'weg_d2_g_cfw'+i, name: 'CFW900 #'+i, page: 'weg_d2_pg_agri', width: '6', height: '5', order: i });
}
// SSW group
agriGroups.push({ id: 'weg_d2_g_ssw', name: 'SSW900 — Soft Starters (RTU)', page: 'weg_d2_pg_agri', width: '12', height: '2', order: 6 });

agriGroups.forEach(g => {
    if (!flows.find(n => n.id === g.id)) {
        flows.push({ id: g.id, type: 'ui-group', name: g.name, page: g.page, width: g.width, height: g.height, order: g.order });
    }
});

// Agrocaraya groups
if (!flows.find(n => n.id === 'weg_d2_g_agro')) {
    flows.push({ id: 'weg_d2_g_agro', type: 'ui-group', name: 'SSW900 #3', page: 'weg_d2_pg_agro', width: '6', height: '3', order: 1 });
}

// Trending groups
if (!flows.find(n => n.id === 'weg_d2_g_tcurr')) {
    flows.push({ id: 'weg_d2_g_tcurr', type: 'ui-group', name: 'Corriente (A)', page: 'weg_d2_pg_trend', width: '12', height: '4', order: 1 });
}
if (!flows.find(n => n.id === 'weg_d2_g_tvolt')) {
    flows.push({ id: 'weg_d2_g_tvolt', type: 'ui-group', name: 'Tension (V)', page: 'weg_d2_pg_trend', width: '12', height: '4', order: 2 });
}

// ============================================================
// FLOW TAB
// ============================================================
flows.push({ id: 'weg_d2_tab', type: 'tab', label: 'WEG Dashboard 2.0', disabled: false });

// ============================================================
// BANNER - ui-text showing status
// ============================================================
flows.push({
    id: 'weg_d2_banner', type: 'ui-text', z: 'weg_d2_tab',
    group: 'weg_d2_g_banner', order: 1, width: '12', height: '1',
    name: 'Banner', label: '', format: '{{msg.payload}}',
    layout: 'row-center', style: 'font-size:1.1em;font-weight:700;font-family:monospace;', font: '',
    x: 700, y: 40, wires: []
});

// ============================================================
// GAUGES FOR EACH CFW900 (4 drives x 6 gauges + 2 texts = 32 widgets)
// ============================================================
function createCFWWidgets(driveNum) {
    const grp = 'weg_d2_g_cfw' + driveNum;
    const prefix = 'weg_d2_c' + driveNum + '_';
    const yBase = 60 + (driveNum - 1) * 70;

    // Gauge definitions
    const gauges = [
        { id: prefix+'rpm', name: 'Velocidad', title: 'Velocidad', units: 'RPM', gtype: 'gauge-half', gstyle: 'rounded', min: 0, max: 1800, w: '3', h: '3', order: 1,
          segments: [{from:'0',color:'#22c55e'},{from:'1200',color:'#f59e0b'},{from:'1500',color:'#ef4444'}] },
        { id: prefix+'amp', name: 'Corriente', title: 'Corriente', units: 'A', gtype: 'gauge-half', gstyle: 'rounded', min: 0, max: 150, w: '3', h: '3', order: 2,
          segments: [{from:'0',color:'#3b82f6'},{from:'80',color:'#f59e0b'},{from:'120',color:'#ef4444'}] },
        { id: prefix+'volt', name: 'Tension', title: 'Tension', units: 'V', gtype: 'gauge-half', gstyle: 'rounded', min: 0, max: 500, w: '3', h: '3', order: 3, icon: 'mdi-flash',
          segments: [{from:'0',color:'#f59e0b'},{from:'380',color:'#22c55e'},{from:'450',color:'#f59e0b'},{from:'480',color:'#ef4444'}] },
        { id: prefix+'hz', name: 'Frecuencia', title: 'Frecuencia', units: 'Hz', gtype: 'gauge-half', gstyle: 'rounded', min: 0, max: 70, w: '3', h: '3', order: 4,
          segments: [{from:'0',color:'#06b6d4'},{from:'50',color:'#22c55e'},{from:'62',color:'#f59e0b'}] },
        { id: prefix+'kw', name: 'Potencia', title: 'Potencia', units: 'kW', gtype: 'gauge-34', gstyle: 'rounded', min: 0, max: 100, w: '3', h: '3', order: 5, icon: 'mdi-lightning-bolt',
          segments: [{from:'0',color:'#22c55e'},{from:'60',color:'#f59e0b'},{from:'85',color:'#ef4444'}] },
        { id: prefix+'temp', name: 'Temp Motor', title: 'Temp. Motor', units: '°C', gtype: 'gauge-tile', gstyle: 'rounded', min: -10, max: 150, w: '3', h: '3', order: 6, icon: 'mdi-thermometer',
          segments: [{from:'-10',color:'#3b82f6'},{from:'30',color:'#22c55e'},{from:'80',color:'#f59e0b'},{from:'120',color:'#ef4444'}] },
    ];

    gauges.forEach(g => {
        flows.push({
            id: g.id, type: 'ui-gauge', z: 'weg_d2_tab',
            group: grp, order: g.order, width: g.w, height: g.h,
            name: g.name, gtype: g.gtype, gstyle: g.gstyle,
            title: g.title, units: g.units, icon: g.icon || '',
            prefix: '', suffix: '',
            segments: g.segments, min: g.min, max: g.max,
            sizeThickness: 16, sizeGap: 4, sizeKeyThickness: 8,
            styleRounded: true, styleGlow: false, className: '',
            x: 750, y: yBase, wires: []
        });
    });

    // Text widgets
    flows.push({
        id: prefix+'cosphi', type: 'ui-text', z: 'weg_d2_tab',
        group: grp, order: 7, width: '3', height: '1',
        name: 'Cos φ', label: 'Cos φ', format: '{{msg.payload}}',
        layout: 'row-spread', style: '', font: '1.5em',
        x: 750, y: yBase + 10, wires: []
    });
    flows.push({
        id: prefix+'status', type: 'ui-text', z: 'weg_d2_tab',
        group: grp, order: 8, width: '3', height: '1',
        name: 'Estado', label: 'Estado', format: '{{msg.payload}}',
        layout: 'row-spread', style: '', font: '1.5em',
        x: 750, y: yBase + 20, wires: []
    });
    flows.push({
        id: prefix+'hours', type: 'ui-text', z: 'weg_d2_tab',
        group: grp, order: 9, width: '6', height: '1',
        name: 'Horas', label: '', format: '{{msg.payload}}',
        layout: 'row-center', style: 'font-size:0.85em;color:#999;font-family:monospace;', font: '',
        x: 750, y: yBase + 30, wires: []
    });
}

for (let i = 1; i <= 4; i++) {
    createCFWWidgets(i);
}

// ============================================================
// SSW900 PLACEHOLDERS (text widgets)
// ============================================================
for (let i = 1; i <= 2; i++) {
    flows.push({
        id: 'weg_d2_ssw'+i, type: 'ui-text', z: 'weg_d2_tab',
        group: 'weg_d2_g_ssw', order: i, width: '6', height: '1',
        name: 'SSW900 #'+i, label: 'SSW900 #'+i, format: 'Modbus RTU — Pendiente conexión TCP',
        layout: 'row-spread', style: 'color:#999;', font: '',
        x: 750, y: 380 + i*20, wires: []
    });
}

// Agrocaraya SSW#3
flows.push({
    id: 'weg_d2_ssw3', type: 'ui-text', z: 'weg_d2_tab',
    group: 'weg_d2_g_agro', order: 1, width: '6', height: '1',
    name: 'SSW900 #3', label: 'SSW900 #3', format: 'Modbus RTU — Pendiente conexión TCP',
    layout: 'row-spread', style: 'color:#999;', font: '',
    x: 750, y: 440, wires: []
});

// ============================================================
// TRENDING - Charts
// ============================================================
flows.push({
    id: 'weg_d2_chart_curr', type: 'ui-chart', z: 'weg_d2_tab',
    group: 'weg_d2_g_tcurr', order: 1, width: '12', height: '4',
    name: 'Corriente CFW900', label: 'Corriente (A)',
    chartType: 'line', xAxisProperty: '', textColor: ['#666'],
    textColorDefault: true, gridColor: ['#e5e7eb'], gridColorDefault: true,
    removeOlder: '600', removeOlderUnit: '1',
    x: 750, y: 480, wires: [[]]
});
flows.push({
    id: 'weg_d2_chart_volt', type: 'ui-chart', z: 'weg_d2_tab',
    group: 'weg_d2_g_tvolt', order: 1, width: '12', height: '4',
    name: 'Tension CFW900', label: 'Tension (V)',
    chartType: 'line', xAxisProperty: '', textColor: ['#666'],
    textColorDefault: true, gridColor: ['#e5e7eb'], gridColorDefault: true,
    removeOlder: '600', removeOlderUnit: '1',
    x: 750, y: 510, wires: [[]]
});

// ============================================================
// SPLITTER FUNCTION - Sends data to all gauges for all 4 drives
// ============================================================
flows.push({
    id: 'weg_d2_splitter', type: 'function', z: 'weg_d2_tab',
    name: 'Split to D2 gauges',
    func: `
var devices = flow.get('cfwDevices') || [null,null,null,null];
var outputs = [];

for (var i = 0; i < 4; i++) {
    var d = devices[i];
    var online = d && d.online && d.lastUpdate && (Date.now() - d.lastUpdate < 15000);

    if (online) {
        outputs.push({payload: d.motorSpeed});         // rpm
        outputs.push({payload: d.current});             // amp
        outputs.push({payload: d.outputVoltage});       // volt
        outputs.push({payload: d.frequency});           // hz
        outputs.push({payload: d.power});               // kw
        outputs.push({payload: d.motorTemp});           // temp
        outputs.push({payload: d.cosPhi.toFixed(2)});   // cosphi
        outputs.push({payload: d.statusText});          // status
        outputs.push({payload: d.hoursEnergized + 'h encendido | ' + d.hoursEnabled + 'h habilitado | ' + (d.hasFault ? d.faultText : 'Sin Falla')}); // hours
    } else {
        outputs.push({payload: 0});    // rpm
        outputs.push({payload: 0});    // amp
        outputs.push({payload: 0});    // volt
        outputs.push({payload: 0});    // hz
        outputs.push({payload: 0});    // kw
        outputs.push({payload: 0});    // temp
        outputs.push({payload: '-'});  // cosphi
        outputs.push({payload: 'OFFLINE'});  // status
        outputs.push({payload: 'Drive offline — ' + ['192.168.10.100','192.168.10.101','192.168.10.102','192.168.10.103'][i]}); // hours
    }
}

// Banner (output 36)
var onlineCount = 0;
var runningCount = 0;
var faultTexts = [];
for (var j = 0; j < 4; j++) {
    var dev = devices[j];
    if (dev && dev.online && dev.lastUpdate && (Date.now() - dev.lastUpdate < 15000)) {
        onlineCount++;
        if (dev.running) runningCount++;
        if (dev.hasFault) faultTexts.push(dev.name + ': ' + dev.faultText);
    }
}
var bannerText = '';
if (faultTexts.length > 0) bannerText = '⚠ ' + faultTexts.join(' | ');
else if (runningCount > 0) bannerText = '● ' + runningCount + '/' + onlineCount + ' DRIVES RUNNING';
else if (onlineCount > 0) bannerText = '● ' + onlineCount + '/4 DRIVES ONLINE — ALL READY';
else bannerText = '○ CONNECTING...';
outputs.push({payload: bannerText});

// Trending current (output 37)
var trendCurr = [];
for (var k = 0; k < 4; k++) {
    var dd = devices[k];
    if (dd && dd.online) trendCurr.push({topic:'CFW#'+(k+1), payload: dd.current});
}
if (trendCurr.length > 0) outputs.push(trendCurr);
else outputs.push(null);

// Trending voltage (output 38)
var trendVolt = [];
for (var k = 0; k < 4; k++) {
    var dd = devices[k];
    if (dd && dd.online) trendVolt.push({topic:'CFW#'+(k+1), payload: dd.outputVoltage});
}
if (trendVolt.length > 0) outputs.push(trendVolt);
else outputs.push(null);

return outputs;
`,
    outputs: 39,
    x: 450, y: 260, wires: [],
});

// Build wires array for the splitter (39 outputs)
const splitterWires = [];
for (let i = 1; i <= 4; i++) {
    const p = 'weg_d2_c' + i + '_';
    splitterWires.push([p+'rpm']);     // rpm
    splitterWires.push([p+'amp']);     // amp
    splitterWires.push([p+'volt']);    // volt
    splitterWires.push([p+'hz']);      // hz
    splitterWires.push([p+'kw']);      // kw
    splitterWires.push([p+'temp']);    // temp
    splitterWires.push([p+'cosphi']); // cosphi
    splitterWires.push([p+'status']); // status
    splitterWires.push([p+'hours']); // hours
}
splitterWires.push(['weg_d2_banner']);      // banner (output 36)
splitterWires.push(['weg_d2_chart_curr']);  // trend current (output 37)
splitterWires.push(['weg_d2_chart_volt']); // trend voltage (output 38)

const splitter = flows.find(n => n.id === 'weg_d2_splitter');
splitter.wires = splitterWires;

// ============================================================
// INJECT - 3s tick
// ============================================================
flows.push({
    id: 'weg_d2_tick', type: 'inject', z: 'weg_d2_tab',
    name: 'D2 Tick 3s', repeat: '3', once: true, onceDelay: '5',
    topic: '', props: [],
    x: 240, y: 260,
    wires: [['weg_d2_splitter']]
});

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Dashboard 2.0 complete build done.');
console.log('Gauges: 4 drives x 9 widgets = 36 widgets');
console.log('+ Banner + 2 SSW + 1 Agrocaraya + 2 Charts = 42 total');
