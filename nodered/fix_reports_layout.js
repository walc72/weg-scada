var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Fix page: use "fixed" layout which gives full page to a single widget
var page = f.find(function(n){ return n.id === 'weg_d2_pg_reports'; });
if (page) {
    page.layout = 'notebook';
    console.log('Page layout: notebook');
}

// Fix group: remove height constraint — use "fixed" to let content flow
var grp = f.find(function(n){ return n.id === 'weg_d2_g_reports'; });
if (grp) {
    grp.width = '24';
    grp.height = '1';
    // Remove the group name to avoid the "Generador de Reportes" label above
    grp.name = ' ';
    grp.showTitle = false;
    console.log('Group updated — no title, full width');
}

// Fix template: set width to fill group, large height
var tmpl = f.find(function(n){ return n.id === 'weg_d2_report_form'; });
if (tmpl) {
    tmpl.width = '24';
    tmpl.height = '20';
    console.log('Template: 24x20');

    // Also wrap the whole template in a style that forces full height
    if (tmpl.format.indexOf('min-height:80vh') === -1) {
        tmpl.format = tmpl.format.replace(
            '<div style="font-family:Inter,system-ui,sans-serif">',
            '<div style="font-family:Inter,system-ui,sans-serif;min-height:80vh;padding:8px">'
        );
        console.log('Added min-height to template');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
