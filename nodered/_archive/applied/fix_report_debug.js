var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var h = f.find(function(n){return n.id==='weg_d2_report_handler'});
if (h) {
    // Add node.warn logs to debug the flow
    h.func = h.func.replace(
        'node.status({fill:"blue",shape:"ring",text:"Querying InfluxDB..."});\n    return [null, msg, null];',
        'node.warn("Report: sending query to InfluxDB, url=" + msg.url);\n' +
        '    node.warn("Report: flux query length=" + msg.payload.length);\n' +
        '    node.status({fill:"blue",shape:"ring",text:"Querying InfluxDB..."});\n' +
        '    return [null, msg, null];'
    );

    h.func = h.func.replace(
        'if (topic === "queryResult") {',
        'if (topic === "queryResult") {\n' +
        '    node.warn("Report: got queryResult, payload type=" + typeof msg.payload + ", length=" + (msg.payload||"").length + ", statusCode=" + msg.statusCode);\n' +
        '    node.warn("Report: first 300 chars: " + String(msg.payload||"").substring(0,300));'
    );

    // Also add log after parsing
    h.func = h.func.replace(
        '    node.status({fill:"green",shape:"dot",text:reportData.length + " drives"});',
        '    node.warn("Report: parsed " + reportData.length + " drives from " + Object.keys(results).length + " result keys");\n' +
        '    node.status({fill:"green",shape:"dot",text:reportData.length + " drives"});'
    );

    console.log('Added debug logs to handler');
}

// Also check the http request node config
var httpNode = f.find(function(n){return n.id==='weg_d2_report_http'});
if (httpNode) {
    console.log('HTTP node config:', JSON.stringify(httpNode, null, 2));
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');
