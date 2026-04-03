var fs = require('fs');
var path = require('path');
var f = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Read logo as base64
var logoPath = '/data/poller-config.json'; // dummy, we'll embed directly
var B64;
try {
  B64 = fs.readFileSync('/data/te_logo.png').toString('base64');
} catch(e) {
  B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

// Remove old logo node
f = f.filter(function(n) { return n.id !== 'weg_header_logo'; });

// Build format as array
var fmt = [];
fmt.push('<template>');
fmt.push('<div style="display:none" ref="injector"></div>');
fmt.push('</template>');
fmt.push('<script>');
fmt.push('export default {');
fmt.push('  mounted: function() {');
fmt.push('    var existing = document.getElementById("te-logo-header");');
fmt.push('    if (existing) return;');
fmt.push('    var img = document.createElement("img");');
fmt.push('    img.src = "data:image/png;base64,' + B64 + '";');
fmt.push('    img.id = "te-logo-header";');
fmt.push('    img.style.cssText = "height:32px;border-radius:4px;position:absolute;right:16px;top:50%;transform:translateY(-50%)";');
fmt.push('    var tryInject = function() {');
fmt.push('      var bar = document.querySelector(".v-toolbar__content");');
fmt.push('      if (bar) { bar.style.position="relative"; bar.appendChild(img); }');
fmt.push('      else { setTimeout(tryInject, 500); }');
fmt.push('    };');
fmt.push('    tryInject();');
fmt.push('  }');
fmt.push('}');
fmt.push('<' + '/script>');

f.push({
  id: 'weg_header_logo',
  type: 'ui-template',
  z: 'weg_d2_tab',
  group: 'weg_d2_g_banner',
  name: 'Header TE Logo',
  order: 99,
  width: '1',
  height: '1',
  head: '',
  format: fmt.join('\n'),
  storeOutMessages: true,
  passthru: false,
  resendOnRefresh: true,
  templateScope: 'local',
  className: '',
  x: 100,
  y: 850,
  wires: [[]]
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Logo injector added: DOM manipulation with retry');
