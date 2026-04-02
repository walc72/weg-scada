var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var cfg = f.find(function(n){return n.id==='weg_d2_config_form'});
if (cfg) {
    // Replace goBack method to use Dashboard 2.0 navigation
    cfg.format = cfg.format.replace(
        "goBack() {\n      window.history.back();\n    },",
        "goBack() {\n      this.$router.push('/dashboard/agriplus').catch(function(){});\n    },"
    );
    console.log('Fixed goBack to use $router.push');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
