const fs = require('fs');
const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

const parseCFW = flows.find(n => n.id === 'weg_parse_cfw');
if (parseCFW) {
    // Replace the hours lines to convert from seconds
    let code = parseCFW.func;

    code = code.replace(
        '// Reg 42: Horas Energizado\n    hoursEnergized: regs[42],\n\n    // Reg 46: Horas Habilitado\n    hoursEnabled: regs[46],',
        '// Reg 42: Tiempo Energizado (SEGUNDOS -> convertir a horas)\n    secondsEnergized: regs[42],\n    hoursEnergized: (regs[42] / 3600).toFixed(1),\n\n    // Reg 46: Tiempo Habilitado (SEGUNDOS -> convertir a horas)\n    secondsEnabled: regs[46],\n    hoursEnabled: (regs[46] / 3600).toFixed(1),'
    );

    parseCFW.func = code;
    console.log('Fixed: hours converted from seconds');
}

// Update dashboard to show hours with decimal and raw seconds
const uiOverview = flows.find(n => n.id === 'weg_ui_overview');
if (uiOverview) {
    let html = uiOverview.format;

    html = html.replace(
        'Horas Energizado</div><div class="wv" style="font-size:20px">{{d.hoursEnergized}} <small>h</small></div></div>',
        'Horas Energizado</div><div class="wv" style="font-size:20px">{{d.hoursEnergized}} <small>h</small></div><div style="color:#666;font-size:10px">{{d.secondsEnergized}} seg</div></div>'
    );

    html = html.replace(
        'Horas Habilitado</div><div class="wv" style="font-size:20px">{{d.hoursEnabled}} <small>h</small></div></div>',
        'Horas Habilitado</div><div class="wv" style="font-size:20px">{{d.hoursEnabled}} <small>h</small></div><div style="color:#666;font-size:10px">{{d.secondsEnabled}} seg</div></div>'
    );

    uiOverview.format = html;
    console.log('Updated dashboard with seconds display');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 2));
console.log('Saved. Restart to apply.');
