const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// The root cause: old data from round-robin is cached in flow context
// Fix: each parser writes ONLY to its specific index with a timestamp
// Combine checks if timestamp is fresh (< 10s ago) to determine online

// 1. Update each individual parser to include timestamp
const parserIds = ['weg_parse_cfw_1','weg_parse_cfw_2','weg_parse_cfw_3','weg_parse_cfw_4'];
parserIds.forEach((id, idx) => {
    const p = flows.find(n => n.id === id);
    if (!p) return;

    // Get original code and add timestamp
    let code = p.func;

    // Replace "online: true" with timestamp check
    code = code.replace(
        'online: true',
        "online: true,\n    lastUpdate: Date.now()"
    );

    p.func = code;
    console.log('Added timestamp to ' + id);
});

// 2. Update combine to check timestamp freshness
const combine = flows.find(n => n.id === 'weg_combine_dashboard');
if (combine) {
    let code = combine.func;

    // Replace the online check
    code = code.replace(
        'if (raw[i] && raw[i].online === true) {',
        'if (raw[i] && raw[i].lastUpdate && (Date.now() - raw[i].lastUpdate) < 10000) {'
    );

    combine.func = code;
    console.log('Updated combine with timestamp-based online check');
}

// 3. Add initialization that clears old data
if (!flows.find(n => n.id === 'weg_clear_init')) {
    flows.push({
        id: 'weg_clear_init',
        type: 'inject',
        z: 'weg_flow_tab',
        name: 'Clear old data on start',
        props: [],
        repeat: '',
        crontab: '',
        once: true,
        onceDelay: '1',
        topic: '',
        x: 250,
        y: 620,
        wires: [['weg_clear_fn']]
    });
    flows.push({
        id: 'weg_clear_fn',
        type: 'function',
        z: 'weg_flow_tab',
        name: 'Reset flow context',
        func: "flow.set('cfwDevices', [null,null,null,null]);\nflow.set('sswDevices', null);\nflow.set('sswInitDone', false);\nflow.set('cfwCallCount', 0);\nnode.status({fill:'green',shape:'dot',text:'Context cleared'});\nreturn null;",
        outputs: 1,
        x: 460,
        y: 620,
        wires: [[]]
    });
    console.log('Added context clear on startup');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved.');
