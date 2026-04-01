var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Fix password section to be horizontal full width
var form = f.find(function(n) { return n.id === 'weg_d2_config_form'; });
if (form) {
    // Replace the password section with a more compact horizontal layout
    form.format = form.format.replace(
        '<v-divider class="my-4"></v-divider>\n    <div style="display:flex;gap:8px;align-items:end">\n      <v-text-field v-model="newPw" label="Nueva contraseña" type="password" variant="outlined" density="compact" hide-details style="max-width:250px"></v-text-field>\n      <v-btn color="warning" size="small" @click="changePw" prepend-icon="mdi-key">Cambiar</v-btn>\n    </div>',
        '<v-divider class="my-4"></v-divider>\n    <div style="display:flex;gap:12px;align-items:center;width:100%">\n      <v-icon color="warning">mdi-key</v-icon>\n      <v-text-field v-model="newPw" label="Nueva contraseña" type="password" variant="outlined" density="compact" hide-details style="flex:1"></v-text-field>\n      <v-btn color="warning" @click="changePw" prepend-icon="mdi-key">Cambiar Contraseña</v-btn>\n    </div>'
    );
    console.log('Fixed password layout');
}

// 2. Re-create the navbar logo inject as part of the navstats widget
var logoB64 = '';
try { logoB64 = fs.readFileSync('/data/public/agriplus.png').toString('base64'); } catch(e) {}

var stats = f.find(function(n) { return n.id === 'weg_d2_navstats'; });
if (stats) {
    // Add mounted script to inject logo into toolbar on every page
    var hasScript = stats.format.indexOf('<script') >= 0;
    if (!hasScript) {
        stats.format = stats.format + '\n<script>\nexport default {\n  mounted() {\n    setTimeout(() => {\n      const t = document.querySelector(".v-toolbar-title__placeholder");\n      if (t && !t.dataset.injected) {\n        t.dataset.injected = "1";\n        t.style.display = "flex";\n        t.style.alignItems = "center";\n        t.style.gap = "10px";\n        t.innerHTML = \'<img src="data:image/png;base64,' + logoB64 + '" style="height:28px"/> <span style="font-weight:700;font-size:1.05em">Estación de Bombeo</span>\';\n      }\n    }, 300);\n  }\n}\n</script>';
        console.log('Added logo inject to navstats');
    } else {
        console.log('Script already exists in navstats');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
