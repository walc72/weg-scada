var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// 1. Template — table header and CSV
var tmpl = f.find(function(n){return n.id==='weg_d2_report_form'});
if (tmpl) {
    tmpl.format = tmpl.format.replace('Tension Prom (V)', 'Tension Salida (V)');
    tmpl.format = tmpl.format.replace('Tension Prom (V)', 'Tension Salida (V)'); // CSV header too
    console.log('Template updated');
}

// 2. Handler — HTML email tables
var h = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (h) {
    h.func = h.func.replace(/Tension Prom/g, 'Tension Salida');
    console.log('Handler updated');
}

// 3. PDF generator
var pdfgen = f.find(function(n){return n.id==='weg_d2_report_pdfgen'});
if (pdfgen) {
    pdfgen.func = pdfgen.func.replace('Tension (V)', 'Tension Sal. (V)');
    console.log('PDF generator updated');
}

// 4. Emailer PDF
var emailer = f.find(function(n){return n.id==='weg_d2_report_emailer'});
if (emailer) {
    emailer.func = emailer.func.replace('Tension (V)', 'Tension Sal. (V)');
    console.log('Emailer updated');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
