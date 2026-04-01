var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Revert to ui-text which DOES work in D2
// Send the label with emoji + text, use className for color
f.forEach(function(n) {
    if (n.name === 'Estado') {
        n.type = 'ui-text';
        n.format = '{{msg.payload}}';
        n.label = '';
        n.layout = 'row-center';
        n.font = '1.4em';
        n.style = '';
        n.className = '';
        n.width = '6';
        n.height = '1';
    }
});

// Update splitter to send rich text with emoji that's very visible
var splitter = f.find(function(n) { return n.id === 'weg_d2_splitter'; });
if (splitter) {
    // Replace status lines to send bold colored emoji text
    splitter.func = splitter.func.replace(
        /var stColor.*?outputs\.push\(\{.*?\}\);          \/\/ status/s,
        "var stLabel = d.running?'🟢 EN MARCHA':d.ready?'🟢 LISTO':d.fault?'🔴 FALLA':'⚪ PARADO';\n" +
        "    outputs.push({payload: stLabel});          // status"
    );

    splitter.func = splitter.func.replace(
        /outputs\.push\(\{payload: '◌ OFFLINE'.*?\}\);  \/\/ status/,
        "outputs.push({payload: '⚫ OFFLINE'});  // status"
    );

    console.log('Updated splitter with emoji status');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
