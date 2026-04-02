var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var cfg = f.find(function(n){return n.id==='weg_d2_config_form'});
if (cfg) {
    // Remove the wrongly placed goBack from template section
    cfg.format = cfg.format.replace(
        "goBack() {\n      this.$router.push('/dashboard/agriplus').catch(function(){});\n    },\n    checkPassword",
        "checkPassword"
    );

    // Add goBack inside the actual methods block
    cfg.format = cfg.format.replace(
        'methods:{\n    checkPassword()',
        'methods:{\n    goBack(){ window.location.href = "/dashboard/agriplus"; },\n    checkPassword()'
    );

    console.log('Moved goBack into methods block');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
