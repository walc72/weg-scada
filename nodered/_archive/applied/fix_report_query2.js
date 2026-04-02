var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var h = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (!h) { console.log('Handler not found!'); process.exit(1); }

// Add toFloat() after the numeric data filter
h.func = h.func.replace(
    '"  |> filter(fn: (r) => " + numFilter + ")\\n" +\n        driveFilter + siteFilter +',
    '"  |> filter(fn: (r) => " + numFilter + ")\\n" +\n        driveFilter + siteFilter +\n        "  |> toFloat()\\n" +'
);

console.log('Added toFloat() to numeric data pipeline');

// Also verify the fix is correct
var idx = h.func.indexOf('toFloat');
console.log('toFloat found at index:', idx);
var snippet = h.func.substring(idx - 50, idx + 100);
console.log('Context:', snippet);

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
