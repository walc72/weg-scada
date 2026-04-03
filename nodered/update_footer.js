var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Remove old footer if exists
f = f.filter(function(n) { return n.id !== 'weg_footer'; });

var fmt = [];
fmt.push('<template>');
fmt.push('<div style="display:none"></div>');
fmt.push('</template>');
fmt.push('<script>');
fmt.push('export default {');
fmt.push('  mounted: function() {');
fmt.push('    var existing = document.getElementById("te-footer");');
fmt.push('    if (existing) return;');
fmt.push('    var footer = document.createElement("div");');
fmt.push('    footer.id = "te-footer";');
fmt.push('    footer.style.cssText = "position:fixed;bottom:0;left:0;width:100%;text-align:center;padding:6px 0;font-size:11px;color:#888;background:rgba(255,255,255,0.95);border-top:1px solid #e0e0e0;z-index:999;font-family:Arial,sans-serif";');
fmt.push('    footer.innerHTML = "Powered by <strong style=\\"color:#1a4d8f\\">Tecno Electric S.A</strong> - W.L";');
fmt.push('    document.body.appendChild(footer);');
fmt.push('  }');
fmt.push('}');
fmt.push('<' + '/script>');

f.push({
  id: 'weg_footer',
  type: 'ui-template',
  z: 'weg_d2_tab',
  group: 'weg_d2_g_banner',
  name: 'Footer Tecno Electric',
  order: 98,
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
  y: 880,
  wires: [[]]
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Footer added');
