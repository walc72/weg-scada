var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. Update config form template - add enabled toggle
// ============================================================
var tpl = f.find(function(n){ return n.id === 'weg_d2_config_form'; });
if (tpl) {
    // Add enabled:true to default drives in data()
    tpl.format = tpl.format.replace(
        /,config:cp\(def\)\}/g,
        ',enabled:true,config:cp(def)}'
    );

    // Add enabled:true to addDevice method
    tpl.format = tpl.format.replace(
        'config:JSON.parse(JSON.stringify(this.defaults))',
        'enabled:true,config:JSON.parse(JSON.stringify(this.defaults))'
    );

    // Add toggle switch in the device alert bar (next to the delete button)
    tpl.format = tpl.format.replace(
        '<template v-slot:append>\n                <v-btn icon="mdi-delete"',
        '<template v-slot:append>\n                <v-switch v-model="dr.enabled" color="green" density="compact" hide-details style="flex:none;margin-right:8px" :label="dr.enabled!==false?\'Activo\':\'Desactivado\'" @update:model-value="saveAll"></v-switch>\n                <v-btn icon="mdi-delete"'
    );

    // Also style disabled devices with reduced opacity
    tpl.format = tpl.format.replace(
        '<v-window-item v-for="(dr, di) in drives" :key="di" :value="di">',
        '<v-window-item v-for="(dr, di) in drives" :key="di" :value="di" :style="dr.enabled===false?\'opacity:0.5\':\'\'">'
    );

    // Add visual indicator in tab
    tpl.format = tpl.format.replace(
        '<v-tab v-for="(dr, i) in drives" :key="i" :value="i">\n            <v-icon start>{{dr.type===\'SSW900\'?\'mdi-rotate-right\':\'mdi-lightning-bolt\'}}</v-icon>{{ dr.name }}',
        '<v-tab v-for="(dr, i) in drives" :key="i" :value="i">\n            <v-icon start :color="dr.enabled!==false?\'\':\' grey\'">{{dr.enabled===false?\'mdi-power-off\':(dr.type===\'SSW900\'?\'mdi-rotate-right\':\'mdi-lightning-bolt\')}}</v-icon>{{ dr.name }}'
    );

    console.log('Updated config form with enabled toggle');
}

// ============================================================
// 2. Update config handler - include enabled in poller config
// ============================================================
var handler = f.find(function(n){ return n.id === 'weg_d2_config_handler'; });
if (handler) {
    // Add enabled field to the device mapping in configJson
    handler.func = handler.func.replace(
        'return {name:d.name,type:d.type||"CFW900",site:d.site||"",ip:resolvedIp,port:502,unitId:parseInt(d.slaveId)||1};',
        'return {name:d.name,type:d.type||"CFW900",site:d.site||"",ip:resolvedIp,port:502,unitId:parseInt(d.slaveId)||1,enabled:d.enabled!==false};'
    );
    console.log('Updated config handler to include enabled flag');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done. Nodes:', f.length);
