var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Get the logo base64
var navstats = f.find(function(x){return x.id==='weg_d2_navstats'});
var logoMatch = navstats.format.match(/data:image\/png;base64,[A-Za-z0-9+\/=]+/);
var logoB64 = logoMatch[0];
console.log('Logo extracted, length:', logoB64.length);

// 1. Set appIcon on ui-base (sidebar header)
var base = f.find(function(x){return x.id==='weg_d2_base'});
if (base) {
    base.appIcon = logoB64;
    console.log('ui-base appIcon set');
}

// 2. Add logo to the report form template header
var tmpl = f.find(function(n){return n.id==='weg_d2_report_form'});
if (tmpl) {
    // Replace the report title to include the logo
    tmpl.format = tmpl.format.replace(
        '<v-icon color="#16a34a" class="mr-2">mdi-file-chart</v-icon> Generador de Reportes',
        '<img src="' + logoB64 + '" style="height:28px;margin-right:8px;vertical-align:middle"> Generador de Reportes'
    );
    console.log('Report form: logo added to header');
}

// 3. Add logo to PDF generator
var pdfgen = f.find(function(n){return n.id==='weg_d2_report_pdfgen'});
if (pdfgen) {
    // Store logo as a global variable for PDF nodes to use
    // We can't easily embed PNG in pdfkit without decoding, but we can add text branding
    // Actually pdfkit supports embedding images from Buffer
    // Add logo decode + image at the top of the PDF
    var oldHeader = 'doc.rect(0, 0, 842, 60).fill("#16a34a");';
    var newHeader = [
        '// Decode logo',
        'var logoData = "' + logoB64.replace('data:image/png;base64,', '') + '";',
        'var logoBuf = Buffer.from(logoData, "base64");',
        '',
        'doc.rect(0, 0, 842, 60).fill("#16a34a");',
        '// Add logo to PDF header',
        'try { doc.image(logoBuf, 40, 10, {height: 40}); } catch(e) { /* skip if image fails */ }'
    ].join('\n');
    pdfgen.func = pdfgen.func.replace(oldHeader, newHeader);
    // Shift title text to the right to make room for logo
    pdfgen.func = pdfgen.func.replace(
        'doc.fontSize(22).fillColor("#ffffff").text("Monitoreo de Drivers", 40, 18);',
        'doc.fontSize(22).fillColor("#ffffff").text("Monitoreo de Drivers", 130, 18);'
    );
    pdfgen.func = pdfgen.func.replace(
        'doc.fontSize(10).fillColor("#dcfce7").text(period',
        'doc.fontSize(10).fillColor("#dcfce7").text(period'
    );
    // Fix period text position too
    pdfgen.func = pdfgen.func.replace(
        '+ new Date().toLocaleDateString("es-PY"), 40, 42);',
        '+ new Date().toLocaleDateString("es-PY"), 130, 42);'
    );
    console.log('PDF generator: logo added');
}

// 4. Same for emailer PDF
var emailer = f.find(function(n){return n.id==='weg_d2_report_emailer'});
if (emailer) {
    var oldH = 'doc.rect(0, 0, 842, 60).fill("#16a34a");';
    var newH = [
        'var logoData = "' + logoB64.replace('data:image/png;base64,', '') + '";',
        'var logoBuf = Buffer.from(logoData, "base64");',
        'doc.rect(0, 0, 842, 60).fill("#16a34a");',
        'try { doc.image(logoBuf, 40, 10, {height: 40}); } catch(e) {}'
    ].join('\n');
    emailer.func = emailer.func.replace(oldH, newH);
    emailer.func = emailer.func.replace(
        'doc.fontSize(22).fillColor("#ffffff").text("Monitoreo de Drivers", 40, 18);',
        'doc.fontSize(22).fillColor("#ffffff").text("Monitoreo de Drivers", 130, 18);'
    );
    emailer.func = emailer.func.replace(
        '+ new Date().toLocaleDateString("es-PY"), 40, 42);',
        '+ new Date().toLocaleDateString("es-PY"), 130, 42);'
    );
    console.log('Emailer: logo added to PDF');
}

// 5. Add logo to email HTML body
var handler = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (handler) {
    // In the sendEmail HTML, add logo img before the title
    handler.func = handler.func.replace(
        "'<h2 style=\"color:#fff;margin:0\">Reporte Monitoreo de Drivers</h2>'",
        "'<div style=\"display:flex;align-items:center;gap:12px\"><img src=\"" + logoB64 + "\" style=\"height:36px\"><h2 style=\"color:#fff;margin:0\">Reporte Monitoreo de Drivers</h2></div>'"
    );
    // Same for scheduled email HTML
    handler.func = handler.func.replace(
        "html += '<h2 style=\"color:#fff;margin:0\">Reporte Monitoreo de Drivers</h2>';",
        "html += '<div style=\"display:flex;align-items:center;gap:12px\"><img src=\"" + logoB64 + "\" style=\"height:36px\"><h2 style=\"color:#fff;margin:0\">Reporte Monitoreo de Drivers</h2></div>';"
    );
    console.log('Handler: logo added to email HTML');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
