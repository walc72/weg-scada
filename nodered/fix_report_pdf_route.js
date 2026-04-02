var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var h = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (!h) { console.log('Handler not found!'); process.exit(1); }

// Remove the wrongly placed downloadPDF block
h.func = h.func.replace(
    '// --- Download PDF ---\nif (topic === "downloadPDF") {\n    return [null, null, null, msg];\n}\n\nreturn null;',
    'return null;'
);

// Now add it BEFORE the very last "return null;" in the function
var lastReturn = h.func.lastIndexOf('return null;');
if (lastReturn !== -1) {
    h.func = h.func.substring(0, lastReturn) +
        '// --- Download PDF ---\n' +
        'if (topic === "downloadPDF") {\n' +
        '    node.warn("PDF: routing to generator, data items=" + (msg.payload.data||[]).length);\n' +
        '    return [null, null, null, msg];\n' +
        '}\n\n' +
        'return null;' +
        h.func.substring(lastReturn + 'return null;'.length);
    console.log('Moved downloadPDF to correct position (before final return null)');
} else {
    console.log('ERROR: could not find last return null;');
}

// Verify
var idx = h.func.lastIndexOf('downloadPDF');
console.log('downloadPDF at position:', idx);
console.log('Context:', h.func.substring(idx - 30, idx + 120));

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
