var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. UPDATE EMAILER: Generate PDF attachment with pdfkit
// ============================================================
var emailer = f.find(function(n){return n.id==='weg_d2_report_emailer'});
if (emailer) {
    emailer.func = [
        'if (!msg.to || !msg._smtp || !msg._smtp.user || !msg._smtp.pass) {',
        '    node.warn("Email: missing to/smtp credentials");',
        '    return {topic: "emailSent", payload: false};',
        '}',
        '',
        '// --- Generate PDF ---',
        'var PDFDocument = pdfkit;',
        'var doc = new PDFDocument({margin: 40, size: "A4", layout: "landscape"});',
        'var buffers = [];',
        'doc.on("data", function(chunk){ buffers.push(chunk); });',
        '',
        'var pdfReady = new Promise(function(resolve){',
        '    doc.on("end", function(){ resolve(Buffer.concat(buffers)); });',
        '});',
        '',
        '// Header',
        'doc.rect(0, 0, 842, 60).fill("#16a34a");',
        'doc.fontSize(22).fillColor("#ffffff").text("Reporte WEG SCADA", 40, 18);',
        'doc.fontSize(10).fillColor("#dcfce7").text((msg._period || "Reporte") + "  —  " + new Date().toLocaleDateString("es-PY"), 40, 42);',
        'doc.moveDown(2);',
        '',
        '// Table setup',
        'var data = msg._reportData || [];',
        'var headers = ["Dispositivo","Sitio","Corr. Prom (A)","Corr. Max (A)","Tension (V)","Frec. (Hz)","Pot. Prom (kW)","Pot. Max (kW)","Temp Max (C)","% Enc."];',
        'var colW = [95, 75, 68, 68, 62, 55, 72, 68, 62, 45];',
        'var startX = 40;',
        'var y = 80;',
        'var rowH = 22;',
        '',
        '// Table header',
        'doc.rect(startX, y, colW.reduce(function(a,b){return a+b},0), rowH).fill("#f1f5f9");',
        'doc.fontSize(8).fillColor("#334155");',
        'var x = startX;',
        'for (var hi = 0; hi < headers.length; hi++) {',
        '    doc.text(headers[hi], x + 3, y + 6, {width: colW[hi] - 6, align: "left"});',
        '    x += colW[hi];',
        '}',
        'y += rowH;',
        '',
        '// Table rows',
        'for (var ri = 0; ri < data.length; ri++) {',
        '    var r = data[ri];',
        '    var bg = ri % 2 === 0 ? "#ffffff" : "#f9fafb";',
        '    doc.rect(startX, y, colW.reduce(function(a,b){return a+b},0), rowH).fill(bg);',
        '    var vals = [r.name, r.site, r.currentMean, r.currentMax, r.voltageMean, r.frequencyMean, r.powerMean, r.powerMax, r.tempMax, r.runPct];',
        '    x = startX;',
        '    doc.fillColor("#1e293b").fontSize(8);',
        '    for (var ci = 0; ci < vals.length; ci++) {',
        '        var align = ci <= 1 ? "left" : "right";',
        '        if (ci === 0) doc.font("Helvetica-Bold"); else doc.font("Helvetica");',
        '        doc.text(String(vals[ci] || "-"), x + 3, y + 6, {width: colW[ci] - 6, align: align});',
        '        x += colW[ci];',
        '    }',
        '    y += rowH;',
        '',
        '    // Page break if needed',
        '    if (y > 540) {',
        '        doc.addPage({margin: 40, size: "A4", layout: "landscape"});',
        '        y = 40;',
        '    }',
        '}',
        '',
        '// Border around table',
        'var totalW = colW.reduce(function(a,b){return a+b},0);',
        'doc.rect(startX, 80, totalW, y - 80).stroke("#e2e8f0");',
        '',
        '// Footer',
        'doc.moveDown(2);',
        'doc.fontSize(8).fillColor("#999").font("Helvetica");',
        'doc.text("Generado automaticamente por WEG SCADA Monitoring — " + new Date().toLocaleString("es-PY"), startX, y + 10);',
        '',
        'doc.end();',
        '',
        '// --- Wait for PDF, then send email ---',
        'var pdfBuffer = await pdfReady;',
        'var fname = "reporte_weg_" + new Date().toISOString().substring(0,10) + ".pdf";',
        '',
        'var transporter = nodemailer.createTransport({',
        '    host: "smtp.gmail.com",',
        '    port: 465,',
        '    secure: true,',
        '    auth: { user: msg._smtp.user, pass: msg._smtp.pass }',
        '});',
        '',
        'var mailOpts = {',
        '    from: "WEG SCADA <" + msg._smtp.user + ">",',
        '    to: msg.to,',
        '    subject: msg.topic || "Reporte WEG SCADA",',
        '    html: msg.payload,',
        '    attachments: [{',
        '        filename: fname,',
        '        content: pdfBuffer,',
        '        contentType: "application/pdf"',
        '    }]',
        '};',
        '',
        'try {',
        '    await transporter.sendMail(mailOpts);',
        '    node.status({fill:"green",shape:"dot",text:"Email+PDF sent to " + msg.to});',
        '    return {topic: "emailSent", payload: true};',
        '} catch(e) {',
        '    node.warn("Email error: " + e.message);',
        '    node.status({fill:"red",shape:"dot",text:"Error: " + e.message});',
        '    return {topic: "emailSent", payload: false};',
        '}'
    ].join('\n');

    // Add pdfkit to libs
    emailer.libs = [
        {var: "nodemailer", module: "nodemailer"},
        {var: "pdfkit", module: "pdfkit"}
    ];
    console.log('Updated emailer with PDF generation');
}

// ============================================================
// 2. UPDATE HANDLER: Pass report data to emailer for PDF
// ============================================================
var handler = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (handler) {
    // In the sendEmail section, add _reportData and _period to the email msg
    handler.func = handler.func.replace(
        '    var emailMsg = {\n' +
        '        to: p.recipients.join(","),\n' +
        '        topic: "Reporte WEG SCADA - " + (p.period || "") + " " + new Date().toLocaleDateString("es-PY"),\n' +
        '        payload: html,\n' +
        '        _smtp: p.smtp\n' +
        '    };',

        '    var emailMsg = {\n' +
        '        to: p.recipients.join(","),\n' +
        '        topic: "Reporte WEG SCADA - " + (p.period || "") + " " + new Date().toLocaleDateString("es-PY"),\n' +
        '        payload: html,\n' +
        '        _smtp: p.smtp,\n' +
        '        _reportData: p.data,\n' +
        '        _period: p.period\n' +
        '    };'
    );

    // Also update the scheduled email section to include _reportData and _period
    handler.func = handler.func.replace(
        "            _smtp: scheduled.smtp\n" +
        "        };\n" +
        "        node.status({fill:\"green\",shape:\"dot\",text:\"Scheduled report sent\"});",

        "            _smtp: scheduled.smtp,\n" +
        "            _reportData: reportData,\n" +
        "            _period: periodName\n" +
        "        };\n" +
        "        node.status({fill:\"green\",shape:\"dot\",text:\"Scheduled report sent\"});"
    );

    console.log('Updated handler to pass reportData to emailer');
}

// ============================================================
// 3. UPDATE TEMPLATE: Add PDF export button (client-side)
// ============================================================
var tmpl = f.find(function(n){return n.id==='weg_d2_report_form'});
if (tmpl) {
    // Replace the existing export buttons with CSV + PDF
    tmpl.format = tmpl.format.replace(
        '<v-btn variant="outlined" prepend-icon="mdi-download" @click="exportCSV">Exportar CSV</v-btn>\n' +
        '        <v-btn variant="outlined" prepend-icon="mdi-printer" @click="printReport">Imprimir</v-btn>',

        '<v-btn variant="outlined" prepend-icon="mdi-download" @click="exportCSV">Exportar CSV</v-btn>\n' +
        '        <v-btn variant="outlined" prepend-icon="mdi-file-pdf-box" color="#ef4444" @click="exportPDF">Exportar PDF</v-btn>\n' +
        '        <v-btn variant="outlined" prepend-icon="mdi-printer" @click="printReport">Imprimir</v-btn>'
    );

    // Add the exportPDF method
    tmpl.format = tmpl.format.replace(
        '    printReport() {\n      window.print();\n    }',

        '    exportPDF() {\n' +
        '      // Send to server to generate PDF and download\n' +
        '      this.send({topic:"downloadPDF", payload:{\n' +
        '        data: this.reportData,\n' +
        '        period: this.periodLabel\n' +
        '      }});\n' +
        '    },\n' +
        '    printReport() {\n      window.print();\n    }'
    );

    // Add handler for PDF download response in the watch
    tmpl.format = tmpl.format.replace(
        "      if (val.topic === \"emailSent\") {",

        "      if (val.topic === \"pdfReady\") {\n" +
        "        // Download PDF from base64\n" +
        "        var b64 = val.payload;\n" +
        "        var byteChars = atob(b64);\n" +
        "        var byteArr = new Uint8Array(byteChars.length);\n" +
        "        for (var bi = 0; bi < byteChars.length; bi++) byteArr[bi] = byteChars.charCodeAt(bi);\n" +
        "        var blob = new Blob([byteArr], {type:'application/pdf'});\n" +
        "        var url = URL.createObjectURL(blob);\n" +
        "        var a = document.createElement('a');\n" +
        "        var d = new Date();\n" +
        "        a.href = url;\n" +
        "        a.download = 'reporte_weg_' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + '.pdf';\n" +
        "        document.body.appendChild(a);\n" +
        "        a.click();\n" +
        "        document.body.removeChild(a);\n" +
        "        URL.revokeObjectURL(url);\n" +
        "      }\n" +
        "      if (val.topic === \"emailSent\") {"
    );

    console.log('Updated template with PDF export button');
}

// ============================================================
// 4. ADD PDF GENERATOR NODE (for client-side download)
// ============================================================
var pdfGenId = 'weg_d2_report_pdfgen';
var existing = f.find(function(n){return n.id===pdfGenId});
if (existing) f.splice(f.indexOf(existing), 1);

f.push({
    id: pdfGenId, type: 'function', z: 'weg_d2_tab',
    name: 'PDF Generator',
    func: [
        'if (msg.topic !== "downloadPDF") return null;',
        'var data = msg.payload.data || [];',
        'var period = msg.payload.period || "Reporte";',
        '',
        'var PDFDocument = pdfkit;',
        'var doc = new PDFDocument({margin: 40, size: "A4", layout: "landscape"});',
        'var buffers = [];',
        'doc.on("data", function(chunk){ buffers.push(chunk); });',
        '',
        'var pdfReady = new Promise(function(resolve){',
        '    doc.on("end", function(){ resolve(Buffer.concat(buffers)); });',
        '});',
        '',
        '// Header bar',
        'doc.rect(0, 0, 842, 60).fill("#16a34a");',
        'doc.fontSize(22).fillColor("#ffffff").text("Reporte WEG SCADA", 40, 18);',
        'doc.fontSize(10).fillColor("#dcfce7").text(period + "  —  " + new Date().toLocaleDateString("es-PY"), 40, 42);',
        'doc.moveDown(2);',
        '',
        'var headers = ["Dispositivo","Sitio","Corr. Prom (A)","Corr. Max (A)","Tension (V)","Frec. (Hz)","Pot. Prom (kW)","Pot. Max (kW)","Temp Max (C)","% Enc."];',
        'var colW = [95, 75, 68, 68, 62, 55, 72, 68, 62, 45];',
        'var startX = 40;',
        'var y = 80;',
        'var rowH = 22;',
        'var totalW = colW.reduce(function(a,b){return a+b},0);',
        '',
        '// Header row',
        'doc.rect(startX, y, totalW, rowH).fill("#f1f5f9");',
        'doc.fontSize(8).fillColor("#334155");',
        'var x = startX;',
        'for (var hi = 0; hi < headers.length; hi++) {',
        '    doc.text(headers[hi], x + 3, y + 6, {width: colW[hi] - 6, align: "left"});',
        '    x += colW[hi];',
        '}',
        'y += rowH;',
        '',
        'for (var ri = 0; ri < data.length; ri++) {',
        '    var r = data[ri];',
        '    doc.rect(startX, y, totalW, rowH).fill(ri % 2 === 0 ? "#ffffff" : "#f9fafb");',
        '    var vals = [r.name, r.site, r.currentMean, r.currentMax, r.voltageMean, r.frequencyMean, r.powerMean, r.powerMax, r.tempMax, r.runPct];',
        '    x = startX;',
        '    doc.fillColor("#1e293b").fontSize(8);',
        '    for (var ci = 0; ci < vals.length; ci++) {',
        '        if (ci === 0) doc.font("Helvetica-Bold"); else doc.font("Helvetica");',
        '        doc.text(String(vals[ci] || "-"), x + 3, y + 6, {width: colW[ci] - 6, align: ci <= 1 ? "left" : "right"});',
        '        x += colW[ci];',
        '    }',
        '    y += rowH;',
        '    if (y > 540) { doc.addPage({margin: 40, size: "A4", layout: "landscape"}); y = 40; }',
        '}',
        '',
        'doc.rect(startX, 80, totalW, y - 80).stroke("#e2e8f0");',
        'doc.fontSize(8).fillColor("#999").font("Helvetica").text("Generado automaticamente por WEG SCADA Monitoring — " + new Date().toLocaleString("es-PY"), startX, y + 10);',
        '',
        'doc.end();',
        'var buf = await pdfReady;',
        'node.status({fill:"green",shape:"dot",text:"PDF generated"});',
        'return {topic: "pdfReady", payload: buf.toString("base64")};'
    ].join('\n'),
    libs: [{var: "pdfkit", module: "pdfkit"}],
    outputs: 1,
    x: 900, y: 560,
    wires: [['weg_d2_report_form']]
});
console.log('Created PDF generator node');

// Wire form to PDF generator (add as second wire from form)
// Actually the form already wires to handler. We need the handler to route downloadPDF to pdfgen.
// Better: add pdfgen handling in the handler
handler.func = handler.func.replace(
    'return null;',
    '// --- Download PDF ---\nif (topic === "downloadPDF") {\n    return [null, null, null, msg];\n}\n\nreturn null;'
);

// Update handler outputs to 4
handler.outputs = 4;
handler.wires = [['weg_d2_report_form'], ['weg_d2_report_http'], ['weg_d2_report_emailer'], ['weg_d2_report_pdfgen']];
console.log('Updated handler: 4 outputs (added PDF route)');

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('\nDone — PDF support added');
