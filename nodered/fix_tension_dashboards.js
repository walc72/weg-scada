var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Agriplus cards — gauge label
var agri = f.find(function(n){return n.id==='weg_dash_agri_cards'});
if (agri) {
    agri.format = agri.format.replace('"Tension", "V"', '"Tension Salida", "V"');
    console.log('Agriplus cards: Tension → Tension Salida');
}

// 2. Agrocaraya cards — gauge label
var agro = f.find(function(n){return n.id==='weg_dash_agro_cards'});
if (agro) {
    agro.format = agro.format.replace('"Tension", "V"', '"Tension Salida", "V"');
    console.log('Agrocaraya cards: Tension → Tension Salida');
}

// 3. Config form — settings label
var cfg = f.find(function(n){return n.id==='weg_d2_config_form'});
if (cfg) {
    cfg.format = cfg.format.replace('"Tensión"', '"Tensión Salida"');
    console.log('Config form: Tensión → Tensión Salida');
}

// 4. Grafana dashboard
var grafanaPath = '/data/grafana/dashboards/weg-overview.json';
try {
    var gf = JSON.parse(fs.readFileSync(grafanaPath));
    var changed = 0;
    if (gf.panels) {
        gf.panels.forEach(function(p) {
            if (p.title && p.title.match(/[Tt]ensi[oó]n/) && !p.title.match(/[Ss]alida/)) {
                var oldTitle = p.title;
                p.title = p.title.replace(/[Tt]ensi[oó]n/, 'Tensión Salida');
                console.log('Grafana panel: ' + oldTitle + ' → ' + p.title);
                changed++;
            }
        });
    }
    if (changed) {
        fs.writeFileSync(grafanaPath, JSON.stringify(gf, null, 2));
        console.log('Grafana dashboard updated');
    } else {
        console.log('Grafana: no panels to update');
    }
} catch(e) {
    console.log('Grafana dashboard not found or error: ' + e.message);
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
