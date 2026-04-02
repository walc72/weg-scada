var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var gu = f.find(function(n){ return n.id === 'weg_grafana_updater'; });
if (gu) {
    // Remove the try/catch wrapper we added earlier
    gu.func = gu.func.replace(/^try \{\n/, '').replace(/\n\} catch\(e\) \{[^}]*\}$/, '');

    // Fix statQuery: replace multiline string with \n concatenation
    var oldStatQuery = 'function statQuery(field, agg) {\n' +
        '  return "from(bucket: \\"weg_drives\\")\n' +
        '  |> range(start: -30s)\n' +
        '  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"" + field + "\\")\n' +
        '  |> filter(fn: (r) => r.name =~ /${drive:regex}/)\n' +
        '  |> filter(fn: (r) => r.site =~ /${site:regex}/)\n' +
        '  |> group()\n' +
        '  |> " + agg + "()";\n' +
        '}';

    var newStatQuery = 'function statQuery(field, agg) {\n' +
        '  return "from(bucket: \\"weg_drives\\")\\n  |> range(start: -30s)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"" + field + "\\")\\n  |> filter(fn: (r) => r.name =~ /${drive:regex}/)\\n  |> filter(fn: (r) => r.site =~ /${site:regex}/)\\n  |> group()\\n  |> " + agg + "()";\n' +
        '}';

    if (gu.func.indexOf(oldStatQuery) !== -1) {
        gu.func = gu.func.replace(oldStatQuery, newStatQuery);
        console.log('Fixed statQuery multiline strings');
    } else {
        console.log('statQuery pattern not found, trying line-by-line fix');
        // Fix by replacing literal newlines inside the return string
        var lines = gu.func.split('\n');
        var result = [];
        var inStatQuery = false;
        var statBuf = '';
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf('function statQuery') !== -1) {
                inStatQuery = true;
                result.push(lines[i]);
                continue;
            }
            if (inStatQuery) {
                if (lines[i].trim() === '}') {
                    // Build the fixed return statement
                    result.push('  return "from(bucket: \\"weg_drives\\")\\n  |> range(start: -30s)\\n  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"" + field + "\\")\\n  |> filter(fn: (r) => r.name =~ /${drive:regex}/)\\n  |> filter(fn: (r) => r.site =~ /${site:regex}/)\\n  |> group()\\n  |> " + agg + "()";');
                    result.push('}');
                    inStatQuery = false;
                    continue;
                }
                // Skip original lines inside statQuery
                continue;
            }
            result.push(lines[i]);
        }
        gu.func = result.join('\n');
        console.log('Fixed statQuery via line-by-line rebuild');
    }
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done.');
