var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Get TE logo base64 from existing node
var logo = f.find(function(n) { return n.id === 'weg_header_logo'; });
var teMatch = logo.format.match(/img\.src = "data:image\/png;base64,([^"]+)"/);
var teB64 = teMatch ? teMatch[1] : '';

// Get agriplus logo
var agriB64 = '';
try { agriB64 = fs.readFileSync('/data/agriplus_logo.png').toString('base64'); } catch(e) {
  console.log('No agriplus logo file, will use text fallback');
}

var T = [];
T.push('<template>');
T.push('<div style="display:none"></div>');
T.push('</template>');
T.push('<script>');
T.push('export default {');
T.push('  mounted: function() {');
T.push('    var teB64 = "' + teB64 + '";');
if (agriB64) {
  T.push('    var agriB64 = "' + agriB64 + '";');
} else {
  T.push('    var agriB64 = "";');
}
T.push('    var checkHeader = function() {');
T.push('      var bar = document.querySelector(".v-toolbar__content");');
T.push('      if (!bar) return;');
T.push('      bar.style.position = "relative";');
T.push('');
T.push('      var titleEl = bar.querySelector(".v-toolbar-title__placeholder");');
T.push('      if (titleEl && titleEl.getAttribute("data-fixed") !== "true") {');
T.push('        if (agriB64) {');
T.push('          titleEl.innerHTML = \'<img src="data:image/png;base64,\' + agriB64 + \'" style="height:28px;margin-right:10px;vertical-align:middle" /><span style="font-weight:bold;font-size:18px">Monitoreo de Drivers</span>\';');
T.push('        } else {');
T.push('          titleEl.innerHTML = \'<span style="font-weight:bold;font-size:18px">agriplus &nbsp; Monitoreo de Drivers</span>\';');
T.push('        }');
T.push('        titleEl.setAttribute("data-fixed", "true");');
T.push('      }');
T.push('');
T.push('      if (!document.getElementById("te-logo-header") && teB64) {');
T.push('        var img = document.createElement("img");');
T.push('        img.src = "data:image/png;base64," + teB64;');
T.push('        img.id = "te-logo-header";');
T.push('        img.style.cssText = "height:48px;border-radius:4px;position:absolute;right:16px;top:50%;transform:translateY(-50%)";');
T.push('        bar.appendChild(img);');
T.push('      }');
T.push('    };');
T.push('    checkHeader();');
T.push('    setInterval(checkHeader, 500);');
T.push('  }');
T.push('}');
T.push('<' + '/script>');

logo.format = T.join('\n');
fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Header fixed: title + TE logo on all pages');
