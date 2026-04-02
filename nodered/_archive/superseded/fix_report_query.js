var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var h = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (!h) { console.log('Handler not found!'); process.exit(1); }

// Replace the Flux query section to handle boolean "running" field separately
var oldQuery = 'var fields = ["current","voltage","frequency","power","motor_temp","motor_speed","running"];\n' +
    '    var fieldFilter = fields.map(function(f){ return \'r._field == "\' + f + \'"\'; }).join(" or ");\n' +
    '\n' +
    '    var flux = "data = from(bucket: \\"weg_drives\\")\\n" +\n' +
    '        "  |> range(start: " + p.start + ", stop: " + p.stop + ")\\n" +\n' +
    '        "  |> filter(fn: (r) => r._measurement == \\"drive_data\\")\\n" +\n' +
    '        "  |> filter(fn: (r) => " + fieldFilter + ")\\n" +\n' +
    '        driveFilter + siteFilter +\n' +
    '        "\\nmeanData = data |> mean() |> set(key: \\"_stat\\", value: \\"mean\\")\\n" +\n' +
    '        "maxData = data |> max() |> set(key: \\"_stat\\", value: \\"max\\")\\n" +\n' +
    '        "union(tables: [meanData, maxData])\\n" +\n' +
    '        "  |> yield(name: \\"result\\")";';

var newQuery = 'var numFields = ["current","voltage","frequency","power","motor_temp","motor_speed"];\n' +
    '    var numFilter = numFields.map(function(f){ return \'r._field == "\' + f + \'"\'; }).join(" or ");\n' +
    '\n' +
    '    var flux = "numData = from(bucket: \\"weg_drives\\")\\n" +\n' +
    '        "  |> range(start: " + p.start + ", stop: " + p.stop + ")\\n" +\n' +
    '        "  |> filter(fn: (r) => r._measurement == \\"drive_data\\")\\n" +\n' +
    '        "  |> filter(fn: (r) => " + numFilter + ")\\n" +\n' +
    '        driveFilter + siteFilter +\n' +
    '        "\\nmeanData = numData |> mean() |> set(key: \\"_stat\\", value: \\"mean\\")\\n" +\n' +
    '        "maxData = numData |> max() |> set(key: \\"_stat\\", value: \\"max\\")\\n" +\n' +
    '        "\\nboolData = from(bucket: \\"weg_drives\\")\\n" +\n' +
    '        "  |> range(start: " + p.start + ", stop: " + p.stop + ")\\n" +\n' +
    '        "  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"running\\")\\n" +\n' +
    '        driveFilter + siteFilter +\n' +
    '        "  |> toFloat()\\n" +\n' +
    '        "  |> mean()\\n" +\n' +
    '        "  |> set(key: \\"_stat\\", value: \\"mean\\")\\n" +\n' +
    '        "union(tables: [meanData, maxData, boolData])\\n" +\n' +
    '        "  |> yield(name: \\"result\\")";';

if (h.func.indexOf(oldQuery) !== -1) {
    h.func = h.func.replace(oldQuery, newQuery);
    console.log('Fixed Flux query — split numeric and boolean fields');
} else {
    console.log('Could not find old query pattern. Trying manual approach...');
    // Manual replacement
    h.func = h.func.replace(
        'var fields = ["current","voltage","frequency","power","motor_temp","motor_speed","running"];',
        'var numFields = ["current","voltage","frequency","power","motor_temp","motor_speed"];'
    );
    h.func = h.func.replace(
        'var fieldFilter = fields.map(function(f){ return \'r._field == "\' + f + \'"\'; }).join(" or ");',
        'var numFilter = numFields.map(function(f){ return \'r._field == "\' + f + \'"\'; }).join(" or ");'
    );
    h.func = h.func.replace(
        '"  |> filter(fn: (r) => " + fieldFilter + ")\\n"',
        '"  |> filter(fn: (r) => " + numFilter + ")\\n"'
    );
    // Replace the Flux query body
    h.func = h.func.replace(
        '"\\nmeanData = data |> mean() |> set(key: \\"_stat\\", value: \\"mean\\")\\n" +\n' +
        '        "maxData = data |> max() |> set(key: \\"_stat\\", value: \\"max\\")\\n" +\n' +
        '        "union(tables: [meanData, maxData])\\n" +\n' +
        '        "  |> yield(name: \\"result\\")";',

        '"\\nmeanData = data |> mean() |> set(key: \\"_stat\\", value: \\"mean\\")\\n" +\n' +
        '        "maxData = data |> max() |> set(key: \\"_stat\\", value: \\"max\\")\\n" +\n' +
        '        "\\nboolData = from(bucket: \\"weg_drives\\")\\n" +\n' +
        '        "  |> range(start: " + p.start + ", stop: " + p.stop + ")\\n" +\n' +
        '        "  |> filter(fn: (r) => r._measurement == \\"drive_data\\" and r._field == \\"running\\")\\n" +\n' +
        '        driveFilter + siteFilter +\n' +
        '        "  |> toFloat()\\n" +\n' +
        '        "  |> mean()\\n" +\n' +
        '        "  |> set(key: \\"_stat\\", value: \\"mean\\")\\n" +\n' +
        '        "union(tables: [meanData, maxData, boolData])\\n" +\n' +
        '        "  |> yield(name: \\"result\\")";'
    );
    console.log('Applied manual fix');
}

// Remove test inject node
var testNode = f.find(function(n){return n.id==='weg_d2_report_test_inject'});
if (testNode) {
    f.splice(f.indexOf(testNode), 1);
    console.log('Removed test inject');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
