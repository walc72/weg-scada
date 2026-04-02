var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// In Dashboard 2.0, ui-template uses Vue 3
// msg is available as a reactive ref

var vueTemplate = '<template>\n' +
'  <div style="display:flex;justify-content:center;padding:4px">\n' +
'    <div v-if="msg?.payload" :style="badgeStyle">{{ msg.payload }}</div>\n' +
'  </div>\n' +
'</template>\n' +
'<script>\n' +
'export default {\n' +
'  computed: {\n' +
'    badgeStyle() {\n' +
'      const p = this.msg?.payload || "";\n' +
'      let bg = "#94a3b8"; let color = "white";\n' +
'      if (p.includes("LISTO")) bg = "#16a34a";\n' +
'      else if (p.includes("MARCHA")) bg = "#2563eb";\n' +
'      else if (p.includes("FALLA")) bg = "#dc2626";\n' +
'      else if (p.includes("PARADO")) bg = "#6b7280";\n' +
'      else if (p.includes("OFFLINE")) { bg = "#e5e7eb"; color = "#9ca3af"; }\n' +
'      return {\n' +
'        backgroundColor: bg, color: color,\n' +
'        padding: "10px 20px", borderRadius: "10px",\n' +
'        fontSize: "1.15em", fontWeight: "800",\n' +
'        letterSpacing: "1px", textAlign: "center",\n' +
'        width: "100%",\n' +
'        boxShadow: p.includes("FALLA") ? "0 2px 12px rgba(220,38,38,0.4)" : "0 2px 8px rgba(0,0,0,0.08)"\n' +
'      };\n' +
'    }\n' +
'  }\n' +
'};\n' +
'</script>';

var count = 0;
f.forEach(function(n) {
    if (n.name === 'Estado' && (n.type === 'ui-text' || n.type === 'ui-template')) {
        n.type = 'ui-template';
        n.format = vueTemplate;
        n.width = '6';
        n.height = '1';
        // Remove ui-text specific props
        delete n.label;
        delete n.font;
        delete n.layout;
        delete n.style;
        count++;
        console.log('Updated:', n.id);
    }
});

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Updated ' + count + ' status badges with Vue 3 template');
