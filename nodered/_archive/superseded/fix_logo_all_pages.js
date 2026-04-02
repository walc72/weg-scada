var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Get the logo base64
var nav = f.find(function(x){return x.id==='weg_d2_navstats'});
var logoMatch = nav.format.match(/data:image\/png;base64,[A-Za-z0-9+\/=]+/);
var logoB64 = logoMatch[0];

// Logo injection script (runs in mounted + watch to handle SPA navigation)
var logoScript = 'function injectLogo(){' +
    'var t=document.querySelector(".v-toolbar-title__placeholder");' +
    'if(t&&!t.querySelector("img")){' +
    't.style.display="flex";t.style.alignItems="center";t.style.gap="10px";' +
    't.innerHTML=\'<img src="' + logoB64 + '" style="height:28px">\'+' +
    '\'<span style="font-weight:700;font-size:1.05em">Monitoreo de Drivers</span>\';' +
    '}}';

// Pages that need the logo: Históricos, Reportes, Configuración
var targets = [
    {page: 'weg_d2_pg_grafana', group: 'weg_d2_g_grafana', templateId: 'weg_d2_grafana_tmpl'},
    {page: 'weg_d2_pg_reports', group: 'weg_d2_g_reports', templateId: 'weg_d2_report_form'},
    {page: 'weg_d2_pg_config', group: 'weg_d2_g_config', templateId: 'weg_d2_config_form'}
];

targets.forEach(function(t) {
    var tmpl = f.find(function(n){return n.id===t.templateId});
    if (!tmpl) {
        console.log(t.templateId + ': not found, skipping');
        return;
    }

    // Check if logo injection already exists
    if (tmpl.format.indexOf('injectLogo') !== -1) {
        console.log(t.templateId + ': already has logo injection');
        return;
    }

    // Add logo injection in mounted() hook
    var mountedIdx = tmpl.format.indexOf('mounted()');
    if (mountedIdx === -1) mountedIdx = tmpl.format.indexOf('mounted ()');

    if (mountedIdx !== -1) {
        // Find the opening brace after mounted()
        var braceIdx = tmpl.format.indexOf('{', mountedIdx);
        tmpl.format = tmpl.format.substring(0, braceIdx + 1) +
            '\n    ' + logoScript + '\n    setTimeout(injectLogo, 200);\n    ' +
            tmpl.format.substring(braceIdx + 1);
        console.log(t.templateId + ': added logo to existing mounted()');
    } else {
        // No mounted hook — add one in the script section
        var exportIdx = tmpl.format.indexOf('export default');
        if (exportIdx !== -1) {
            // Find the first { after export default
            var objBrace = tmpl.format.indexOf('{', exportIdx);
            tmpl.format = tmpl.format.substring(0, objBrace + 1) +
                '\n  mounted() {\n    ' + logoScript + '\n    setTimeout(injectLogo, 200);\n  },\n  ' +
                tmpl.format.substring(objBrace + 1);
            console.log(t.templateId + ': added mounted() with logo');
        } else {
            console.log(t.templateId + ': no export default found, cannot add logo');
        }
    }
});

// Also update the navstats banner title
nav.format = nav.format.replace('Estación de Bombeo', 'Monitoreo de Drivers');
if (nav.format.indexOf('Monitoreo de Drivers') !== -1) {
    console.log('navstats: title already updated');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
