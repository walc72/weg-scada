var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var nav = f.find(function(x){return x.id==='weg_d2_navstats'});
var logoMatch = nav.format.match(/data:image\/png;base64,[A-Za-z0-9+\/=]+/);
var logoB64 = logoMatch[0];

var logoScript = 'function injectLogo(){' +
    'var t=document.querySelector(".v-toolbar-title__placeholder");' +
    'if(t&&!t.querySelector("img")){' +
    't.style.display="flex";t.style.alignItems="center";t.style.gap="10px";' +
    't.innerHTML=\'<img src="' + logoB64 + '" style="height:28px">\'+' +
    '\'<span style="font-weight:700;font-size:1.05em">Monitoreo de Drivers</span>\';' +
    '}}';

var tmpl = f.find(function(n){return n.id==='weg_d2_grafana_iframe'});
if (tmpl) {
    tmpl.format = tmpl.format.replace(
        'export default {\n  computed:',
        'export default {\n  mounted() {\n    ' + logoScript + '\n    setTimeout(injectLogo, 200);\n  },\n  computed:'
    );
    console.log('Historicos: added logo injection');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
