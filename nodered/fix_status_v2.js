var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Revert status back to ui-text but with HTML format
f.forEach(function(n) {
    if (n.name === 'Estado' && n.type === 'ui-template') {
        n.type = 'ui-text';
        n.label = '';
        n.format = '{{msg.payload}}';
        n.layout = 'row-center';
        n.style = '';
        n.font = '';
        n.width = '6';
        n.height = '1';
        console.log('Reverted:', n.id);
    }
});

// 2. Update the splitter to send pre-formatted status with color
var splitter = f.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter) {
    // Replace status output lines
    splitter.func = splitter.func.replace(
        "outputs.push({payload: d.statusText});          // status",
        "// Status badge with color\n" +
        "    var stColor = d.running?'#2563eb':d.ready?'#16a34a':d.fault?'#dc2626':'#6b7280';\n" +
        "    var stLabel = d.running?'⚡ EN MARCHA':d.ready?'● LISTO':d.fault?'⚠ FALLA':'⏻ PARADO';\n" +
        "    outputs.push({payload: stLabel, ui_update:{style:{backgroundColor:stColor,color:'white',padding:'8px 16px',borderRadius:'8px',fontSize:'1.1em',fontWeight:'800',letterSpacing:'1px',textAlign:'center',width:'100%'}}});          // status"
    );

    // Also fix offline status
    splitter.func = splitter.func.replace(
        "outputs.push({payload: 'OFFLINE'});  // status",
        "outputs.push({payload: '◌ OFFLINE', ui_update:{style:{backgroundColor:'#e5e7eb',color:'#9ca3af',padding:'8px 16px',borderRadius:'8px',fontSize:'1.1em',fontWeight:'800',letterSpacing:'1px',textAlign:'center',width:'100%'}}});  // status"
    );

    console.log('Updated splitter with styled status');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
