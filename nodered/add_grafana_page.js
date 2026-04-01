var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. Add "Históricos" page
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_d2_pg_grafana'; })) {
    f.push({
        id: 'weg_d2_pg_grafana',
        type: 'ui-page',
        name: 'Históricos',
        ui: 'weg_d2_ui',
        path: '/historicos',
        icon: 'mdi-chart-line',
        layout: 'notebook',
        theme: '',
        order: 3,
        className: '',
        visible: 'true',
        disabled: 'false'
    });
    console.log('Added page: Históricos');
}

// ============================================================
// 2. Add group for Grafana iframe
// ============================================================
if (!f.find(function(n){ return n.id === 'weg_d2_g_grafana'; })) {
    f.push({
        id: 'weg_d2_g_grafana',
        type: 'ui-group',
        name: 'Grafana',
        page: 'weg_d2_pg_grafana',
        width: '24',
        height: '-1',
        order: 1,
        showTitle: false,
        className: '',
        visible: 'true',
        disabled: 'false'
    });
    console.log('Added group: Grafana');
}

// ============================================================
// 3. Add Grafana iframe template
// ============================================================
var grafanaTemplate = [
'<template>',
'<div>',
'  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">',
'    <v-icon color="orange">mdi-chart-line</v-icon>',
'    <span style="font-weight:700;font-size:1.1em">Datos Históricos — Grafana</span>',
'    <v-spacer></v-spacer>',
'    <v-btn variant="outlined" size="small" color="blue" href="/grafana" target="_blank">',
'      <v-icon start>mdi-open-in-new</v-icon> Abrir Grafana',
'    </v-btn>',
'  </div>',
'  <iframe',
'    :src="grafanaUrl"',
'    style="width:100%;height:calc(100vh - 120px);border:none;border-radius:8px"',
'    frameborder="0"',
'  ></iframe>',
'</div>',
'</template>',
'<script>',
'export default {',
'  computed: {',
'    grafanaUrl() {',
'      var host = window.location.hostname;',
'      return "http://" + host + ":3000/d/weg-overview/weg-drives-overview?orgId=1&kiosk&theme=light&refresh=10s";',
'    }',
'  }',
'}',
'</script>'
].join('\n');

if (!f.find(function(n){ return n.id === 'weg_d2_grafana_iframe'; })) {
    f.push({
        id: 'weg_d2_grafana_iframe',
        type: 'ui-template',
        z: 'weg_d2_tab',
        group: 'weg_d2_g_grafana',
        name: 'Grafana Iframe',
        page: '',
        ui: '',
        templateScope: 'local',
        order: 1,
        width: '24',
        height: '-1',
        head: '',
        format: grafanaTemplate,
        storeOutMessages: true,
        passthru: false,
        resendOnRefresh: true,
        className: '',
        x: 520,
        y: 440,
        wires: [[]]
    });
    console.log('Added Grafana iframe template');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done. Nodes:', f.length);
