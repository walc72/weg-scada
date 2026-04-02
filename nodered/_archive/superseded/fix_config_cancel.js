var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var cfg = f.find(function(n){return n.id==='weg_d2_config_form'});
if (cfg) {
    // Add Cancelar button before Ingresar
    cfg.format = cfg.format.replace(
        '<v-spacer></v-spacer><v-btn color="primary" @click="checkPassword"',
        '<v-spacer></v-spacer><v-btn variant="text" @click="goBack">Cancelar</v-btn><v-btn color="primary" @click="checkPassword"'
    );

    // Add goBack method
    cfg.format = cfg.format.replace(
        'checkPassword() {',
        'goBack() {\n' +
        '      window.history.back();\n' +
        '    },\n' +
        '    checkPassword() {'
    );

    console.log('Added Cancelar button to config dialog');
}

// Same for the report form auth dialog
var rpt = f.find(function(n){return n.id==='weg_d2_report_form'});
if (rpt && rpt.format.indexOf('authEmail') !== -1) {
    // Check if there's a similar dialog
    var hasDialog = rpt.format.indexOf('Desbloquear') !== -1;
    console.log('Report form has auth section:', hasDialog);
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
