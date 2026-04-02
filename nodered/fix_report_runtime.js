var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// ============================================================
// 1. UPDATE TEMPLATE: rename column and show hours
// ============================================================
var tmpl = f.find(function(n){return n.id==='weg_d2_report_form'});
if (tmpl) {
    // Table header
    tmpl.format = tmpl.format.replace('>% Encendido</th>', '>Tiempo en Marcha</th>');
    // Table row value
    tmpl.format = tmpl.format.replace('{{ r.runPct }}', '{{ r.runHours }}');
    // CSV header
    tmpl.format = tmpl.format.replace('% Encendido', 'Tiempo en Marcha (h)');
    // CSV row
    tmpl.format = tmpl.format.replace('r.runPct', 'r.runHours');
    console.log('Template updated: % Enc → Tiempo en Marcha (h)');
}

// ============================================================
// 2. UPDATE HANDLER: calculate hours instead of percentage
// ============================================================
var h = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (h) {
    // In the queryResult section, change runPct to runHours
    // The running_mean is a 0-1 fraction. Multiply by total hours in the period.
    // We need to know the time range — stored in flow.set("reportQuery")
    h.func = h.func.replace(
        "        var runMean = r.running_mean || 0;\n" +
        "        reportData.push({\n" +
        "            name: r.name,\n" +
        "            site: r.site || \"-\",\n" +
        "            currentMean: (r.current_mean || 0).toFixed(1),\n" +
        "            currentMax: (r.current_max || 0).toFixed(1),\n" +
        "            voltageMean: (r.voltage_mean || 0).toFixed(0),\n" +
        "            frequencyMean: (r.frequency_mean || 0).toFixed(1),\n" +
        "            powerMean: (r.power_mean || 0).toFixed(1),\n" +
        "            powerMax: (r.power_max || 0).toFixed(1),\n" +
        "            tempMax: (r.motor_temp_max || 0).toFixed(0),\n" +
        "            runPct: (runMean * 100).toFixed(0) + \"%\"\n" +
        "        });",

        "        var runMean = r.running_mean || 0;\n" +
        "        var qp = flow.get(\"reportQuery\") || {};\n" +
        "        var totalHours = 168;\n" +
        "        if (qp.start && qp.stop) {\n" +
        "            totalHours = (new Date(qp.stop).getTime() - new Date(qp.start).getTime()) / 3600000;\n" +
        "        }\n" +
        "        var runH = runMean * totalHours;\n" +
        "        reportData.push({\n" +
        "            name: r.name,\n" +
        "            site: r.site || \"-\",\n" +
        "            currentMean: (r.current_mean || 0).toFixed(1),\n" +
        "            currentMax: (r.current_max || 0).toFixed(1),\n" +
        "            voltageMean: (r.voltage_mean || 0).toFixed(0),\n" +
        "            frequencyMean: (r.frequency_mean || 0).toFixed(1),\n" +
        "            powerMean: (r.power_mean || 0).toFixed(1),\n" +
        "            powerMax: (r.power_max || 0).toFixed(1),\n" +
        "            tempMax: (r.motor_temp_max || 0).toFixed(0),\n" +
        "            runHours: runH.toFixed(1) + \" h\"\n" +
        "        });"
    );
    console.log('Handler updated: runPct → runHours');
}

// ============================================================
// 3. UPDATE PDF GENERATOR + EMAILER: rename column
// ============================================================
var pdfgen = f.find(function(n){return n.id==='weg_d2_report_pdfgen'});
if (pdfgen) {
    pdfgen.func = pdfgen.func.replace('"% Enc."', '"T. Marcha"');
    pdfgen.func = pdfgen.func.replace('r.runPct', 'r.runHours');
    console.log('PDF generator updated');
}

var emailer = f.find(function(n){return n.id==='weg_d2_report_emailer'});
if (emailer) {
    emailer.func = emailer.func.replace('"% Enc."', '"T. Marcha"');
    emailer.func = emailer.func.replace('r.runPct', 'r.runHours');
    console.log('Emailer updated');
}

// Also update the HTML email in the handler (sendEmail and scheduled sections)
if (h) {
    h.func = h.func.replace(/% Enc\./g, 'T. Marcha');
    h.func = h.func.replace(/r\.runPct/g, 'r.runHours');
    h.func = h.func.replace(/er\.runPct/g, 'er.runHours');
    console.log('Handler email HTML updated');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
