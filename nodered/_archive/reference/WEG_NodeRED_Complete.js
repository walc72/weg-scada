// ============================================================================
// WEG MONITORING DASHBOARD - Node-RED Complete Implementation
// Copy each section into the corresponding Function nodes in Node-RED
// ============================================================================
// Architecture:
//   M241 PLC (Modbus RTU master to WEG drives)
//       └── Modbus TCP server (port 502)
//             └── Node-RED reads PLC variables via Modbus TCP
//                   └── Dashboard (browser)
// ============================================================================


// ============================================================================
// M241 MODBUS TCP REGISTER MAP
// ============================================================================
// You must create a Modbus TCP server object in Machine Expert and map
// the GVL_WEG variables to holding registers.
//
// In Machine Expert:
// 1. Go to Application > Add Object > Modbus TCP Slave Device
// 2. Map variables to Holding Registers (%MW):
//
// CFW900 #1: %MW0  - %MW9
// CFW900 #2: %MW10 - %MW19
// CFW900 #3: %MW20 - %MW29
// CFW900 #4: %MW30 - %MW39
// SSW900 #1: %MW40 - %MW49
// SSW900 #2: %MW50 - %MW59
// SSW900 #3: %MW60 - %MW69
// SSW900 #4: %MW70 - %MW79
//
// Register layout per CFW900 (10 words each):
// Offset +0: Status Word (WORD)
// Offset +1: Speed RPM (INT, x1)
// Offset +2: Output Current (INT, x10 = 0.1A resolution)
// Offset +3: Output Frequency (INT, x10 = 0.1Hz resolution)
// Offset +4: DC Bus Voltage (INT, x10 = 0.1V resolution)
// Offset +5: Motor Torque (INT, x10 = 0.1% resolution)
// Offset +6: Fault Code (WORD)
// Offset +7: Online flag (WORD, 0/1)
// Offset +8: Comm Error Count (WORD)
// Offset +9: Reserved
//
// Register layout per SSW900 (10 words each):
// Offset +0: Status Word (WORD)
// Offset +1: Motor Current (INT, x10)
// Offset +2: Motor Voltage (INT, x10)
// Offset +3: Motor Power (INT, x10)
// Offset +4: Fault Code (WORD)
// Offset +5: Online flag (WORD, 0/1)
// Offset +6: Comm Error Count (WORD)
// Offset +7-9: Reserved
// ============================================================================


// ============================================================================
// PLC SUPPORT CODE (add this to Machine Expert project)
// Maps GVL_WEG to %MW registers for Modbus TCP access
// ============================================================================
/*
PROGRAM PRG_ModbusTCP_Map
VAR
    i : INT;
END_VAR

// CFW900 mapping to %MW
FOR i := 1 TO 4 DO
    // Base address: (i-1) * 10
    %MW[(i-1)*10 + 0]  := WORD_TO_INT(GVL_WEG.stCFW900[i].wStatusWord);
    %MW[(i-1)*10 + 1]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rSpeedRPM);
    %MW[(i-1)*10 + 2]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rOutputCurrent * 10.0);
    %MW[(i-1)*10 + 3]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rOutputFreq * 10.0);
    %MW[(i-1)*10 + 4]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rDCBusVoltage * 10.0);
    %MW[(i-1)*10 + 5]  := REAL_TO_INT(GVL_WEG.stCFW900[i].rMotorTorque * 10.0);
    %MW[(i-1)*10 + 6]  := WORD_TO_INT(GVL_WEG.stCFW900[i].wFaultCode);
    %MW[(i-1)*10 + 7]  := BOOL_TO_INT(GVL_WEG.stCFW900[i].bOnline);
    %MW[(i-1)*10 + 8]  := UINT_TO_INT(GVL_WEG.stCFW900[i].uiCommErrCount);
END_FOR;

// SSW900 mapping to %MW (base 40)
FOR i := 1 TO 4 DO
    %MW[40 + (i-1)*10 + 0] := WORD_TO_INT(GVL_WEG.stSSW900[i].wStatusWord);
    %MW[40 + (i-1)*10 + 1] := REAL_TO_INT(GVL_WEG.stSSW900[i].rMotorCurrent * 10.0);
    %MW[40 + (i-1)*10 + 2] := REAL_TO_INT(GVL_WEG.stSSW900[i].rMotorVoltage * 10.0);
    %MW[40 + (i-1)*10 + 3] := REAL_TO_INT(GVL_WEG.stSSW900[i].rMotorPower * 10.0);
    %MW[40 + (i-1)*10 + 4] := WORD_TO_INT(GVL_WEG.stSSW900[i].wFaultCode);
    %MW[40 + (i-1)*10 + 5] := BOOL_TO_INT(GVL_WEG.stSSW900[i].bOnline);
    %MW[40 + (i-1)*10 + 6] := UINT_TO_INT(GVL_WEG.stSSW900[i].uiCommErrCount);
END_FOR;
*/


// ============================================================================
// FUNCTION NODE: "Parse CFW900 Data"
// Input: msg.payload = array of 40 integers (registers %MW0-%MW39)
// Output: msg.payload = object with 4 CFW900 devices
// ============================================================================

// --- Parse CFW900 ---
function parseCFW900(registers) {
    const devices = [];
    const faultTexts = {
        0: "No Fault", 2: "F002: Overcurrent", 3: "F003: DC Overvoltage",
        4: "F004: IGBT Overtemp", 5: "F005: Motor Overload", 6: "F006: Drive Overtemp",
        7: "F007: Overcurrent Ph-U", 8: "F008: Overcurrent Ph-V", 9: "F009: Overcurrent Ph-W",
        12: "F012: Phase Loss Input", 21: "F021: Earth Fault", 22: "F022: Motor Overtemp PTC",
        33: "F033: Undervoltage", 49: "F049: Motor Stalled",
        70: "F070: Comm Error", 72: "F072: Fieldbus Timeout", 74: "F074: Serial Error"
    };

    for (let i = 0; i < 4; i++) {
        const base = i * 10;
        const statusWord = registers[base + 0];
        const faultCode = registers[base + 6];

        devices.push({
            name: `CFW900 #${i + 1}`,
            statusWord: statusWord,
            speedRPM: registers[base + 1],
            current: registers[base + 2] / 10.0,
            frequency: registers[base + 3] / 10.0,
            dcBusVoltage: registers[base + 4] / 10.0,
            torque: registers[base + 5] / 10.0,
            faultCode: faultCode,
            faultText: faultTexts[faultCode] || `Fault Code: ${faultCode}`,
            online: registers[base + 7] === 1,
            commErrors: registers[base + 8],

            // Decoded status bits
            ready:   (statusWord & 0x0001) !== 0,
            running: (statusWord & 0x0002) !== 0,
            fault:   (statusWord & 0x0008) !== 0,
            warning: (statusWord & 0x0080) !== 0,

            // Status text and color
            get statusText() {
                if (this.fault) return "FAULT";
                if (this.running) return "RUNNING";
                if (this.ready) return "READY";
                return "OFF";
            },
            get statusColor() {
                if (this.fault) return "#DC0000";
                if (this.running) return "#0064DC";
                if (this.ready) return "#00B400";
                return "#808080";
            }
        });
    }
    return devices;
}


// ============================================================================
// FUNCTION NODE: "Parse SSW900 Data"
// Input: msg.payload = array of 40 integers (registers %MW40-%MW79)
// Output: msg.payload = object with 4 SSW900 devices
// ============================================================================

// --- Parse SSW900 ---
function parseSSW900(registers) {
    const devices = [];
    const faultTexts = {
        0: "No Fault", 1: "F01: Motor Overcurrent", 2: "F02: Phase Sequence",
        3: "F03: Phase Loss Input", 4: "F04: Phase Loss Output", 5: "F05: Thyristor Short",
        6: "F06: Heatsink Overtemp", 7: "F07: Motor Overload", 8: "F08: Undervoltage",
        9: "F09: Overvoltage", 10: "F10: Phase Imbalance", 11: "F11: Motor PTC Overtemp",
        20: "F20: Bypass Contactor", 30: "F30: Comm Error",
        51: "F51: Locked Rotor", 73: "F73: Serial Timeout"
    };

    for (let i = 0; i < 4; i++) {
        const base = i * 10;
        const statusWord = registers[base + 0];
        const faultCode = registers[base + 4];

        devices.push({
            name: `SSW900 #${i + 1}`,
            statusWord: statusWord,
            current: registers[base + 1] / 10.0,
            voltage: registers[base + 2] / 10.0,
            power: registers[base + 3] / 10.0,
            faultCode: faultCode,
            faultText: faultTexts[faultCode] || `Fault Code: ${faultCode}`,
            online: registers[base + 5] === 1,
            commErrors: registers[base + 6],

            ready:    (statusWord & 0x0001) !== 0,
            running:  (statusWord & 0x0002) !== 0,
            starting: (statusWord & 0x0004) !== 0,
            fault:    (statusWord & 0x0008) !== 0,

            get statusText() {
                if (this.fault) return "FAULT";
                if (this.running) return "RUNNING";
                if (this.starting) return "STARTING";
                if (this.ready) return "READY";
                return "OFF";
            },
            get statusColor() {
                if (this.fault) return "#DC0000";
                if (this.running) return "#0064DC";
                if (this.starting) return "#C8C800";
                if (this.ready) return "#00B400";
                return "#808080";
            }
        });
    }
    return devices;
}


// ============================================================================
// FUNCTION NODE: "Build Alarm Banner"
// Input: flow context with cfwDevices and sswDevices
// Output: msg.payload = { text, color, hasFaults, faultCount }
// ============================================================================

function buildAlarmBanner() {
    const cfwDevices = flow.get("cfwDevices") || [];
    const sswDevices = flow.get("sswDevices") || [];
    const faults = [];

    cfwDevices.forEach(d => {
        if (d.fault) faults.push(`${d.name}: ${d.faultText}`);
        else if (!d.online) faults.push(`${d.name}: COMM LOST`);
    });

    sswDevices.forEach(d => {
        if (d.fault) faults.push(`${d.name}: ${d.faultText}`);
        else if (!d.online) faults.push(`${d.name}: COMM LOST`);
    });

    if (faults.length === 0) {
        return {
            payload: {
                text: "SYSTEM OK - All drives operating normally",
                color: "#00B400",
                hasFaults: false,
                faultCount: 0
            }
        };
    }

    // Rotate through faults
    const idx = (flow.get("bannerIndex") || 0) % faults.length;
    flow.set("bannerIndex", idx + 1);

    return {
        payload: {
            text: `[${idx + 1}/${faults.length}] ${faults[idx]}`,
            color: "#DC0000",
            hasFaults: true,
            faultCount: faults.length
        }
    };
}


// ============================================================================
// FUNCTION NODE: "Voltage Monitor"
// Tracks min/max/avg and detects imbalance
// ============================================================================

function voltageMonitor() {
    const cfwDevices = flow.get("cfwDevices") || [];
    const sswDevices = flow.get("sswDevices") || [];

    // Get or init voltage stats
    let vStats = flow.get("voltageStats") || {
        cfw: [{}, {}, {}, {}],
        ssw: [{}, {}, {}, {}]
    };

    // CFW900 DC Bus Voltage
    const cfwVoltage = [];
    cfwDevices.forEach((d, i) => {
        if (!vStats.cfw[i].min) {
            vStats.cfw[i] = { min: 9999, max: 0, sum: 0, count: 0 };
        }

        const v = d.dcBusVoltage;
        if (v > 0 && d.online) {
            vStats.cfw[i].min = Math.min(vStats.cfw[i].min, v);
            vStats.cfw[i].max = Math.max(vStats.cfw[i].max, v);
            vStats.cfw[i].sum += v;
            vStats.cfw[i].count++;
        }

        cfwVoltage.push({
            name: d.name,
            now: v,
            min: vStats.cfw[i].count > 0 ? vStats.cfw[i].min : 0,
            max: vStats.cfw[i].max,
            avg: vStats.cfw[i].count > 0 ? (vStats.cfw[i].sum / vStats.cfw[i].count).toFixed(1) : 0,
            overvoltage: v > 750,
            undervoltage: v < 350 && v > 0,
            alarm: (v > 750) || (v < 350 && v > 0)
        });
    });

    // SSW900 Motor Voltage + imbalance
    const sswVoltage = [];
    let sswSum = 0, sswOnline = 0;

    sswDevices.forEach((d, i) => {
        if (!vStats.ssw[i].min) {
            vStats.ssw[i] = { min: 9999, max: 0, sum: 0, count: 0 };
        }

        const v = d.voltage;
        if (v > 0 && d.online) {
            vStats.ssw[i].min = Math.min(vStats.ssw[i].min, v);
            vStats.ssw[i].max = Math.max(vStats.ssw[i].max, v);
            vStats.ssw[i].sum += v;
            vStats.ssw[i].count++;
            sswSum += v;
            sswOnline++;
        }

        sswVoltage.push({
            name: d.name,
            now: v,
            min: vStats.ssw[i].count > 0 ? vStats.ssw[i].min : 0,
            max: vStats.ssw[i].max,
            avg: vStats.ssw[i].count > 0 ? (vStats.ssw[i].sum / vStats.ssw[i].count).toFixed(1) : 0,
            overvoltage: v > 480,
            undervoltage: v < 400 && v > 0
        });
    });

    // Imbalance calculation
    if (sswOnline >= 2) {
        const avgV = sswSum / sswOnline;
        sswVoltage.forEach(sv => {
            sv.deviation = avgV > 0 ? Math.abs(sv.now - avgV) / avgV * 100 : 0;
            sv.imbalanceAlarm = sv.deviation > 5.0;
            sv.alarm = sv.overvoltage || sv.undervoltage || sv.imbalanceAlarm;
        });
    }

    flow.set("voltageStats", vStats);

    return {
        payload: { cfwVoltage, sswVoltage }
    };
}


// ============================================================================
// FUNCTION NODE: "Build CSV Line"
// Creates a CSV record for data export
// ============================================================================

function buildCSVLine() {
    const cfwDevices = flow.get("cfwDevices") || [];
    const sswDevices = flow.get("sswDevices") || [];
    const now = new Date();

    const timestamp = now.toISOString().replace("T", " ").substring(0, 19);

    let line = timestamp;

    // CFW900 data
    cfwDevices.forEach(d => {
        line += `,${d.current},${d.frequency},${d.dcBusVoltage},${d.torque},${d.speedRPM},${d.statusText},${d.faultText}`;
    });

    // SSW900 data
    sswDevices.forEach(d => {
        line += `,${d.current},${d.voltage},${d.power},${d.statusText},${d.faultText}`;
    });

    return { payload: line + "\n" };
}

// CSV Header
function getCSVHeader() {
    let h = "DateTime";
    for (let i = 1; i <= 4; i++) {
        h += `,CFW${i}_A,CFW${i}_Hz,CFW${i}_VDC,CFW${i}_Torq,CFW${i}_RPM,CFW${i}_Status,CFW${i}_Fault`;
    }
    for (let i = 1; i <= 4; i++) {
        h += `,SSW${i}_A,SSW${i}_V,SSW${i}_kW,SSW${i}_Status,SSW${i}_Fault`;
    }
    return h + "\n";
}


// ============================================================================
// FUNCTION NODE: "Overview HTML Template"
// Generates the overview dashboard cards
// Use in a ui_template node
// ============================================================================

const overviewTemplate = `
<style>
    .device-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .device-card {
        background: #1e1e1e; border-radius: 8px; padding: 12px;
        border-left: 4px solid {{statusColor}}; color: white;
    }
    .device-name { font-size: 14px; font-weight: bold; color: #ccc; }
    .device-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; display: inline-block; }
    .device-value { font-size: 22px; font-weight: bold; margin: 4px 0; }
    .device-label { font-size: 11px; color: #888; }
    .bar-container { background: #333; border-radius: 3px; height: 6px; margin: 4px 0; }
    .bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
    .status-running { background: #0064DC; }
    .status-ready { background: #00B400; }
    .status-fault { background: #DC0000; animation: blink 0.5s infinite; }
    .status-starting { background: #C8C800; }
    .status-off { background: #808080; }
    @keyframes blink { 50% { opacity: 0.5; } }

    .banner {
        padding: 10px 16px; border-radius: 6px; text-align: center;
        font-weight: bold; font-size: 16px; color: white; margin-bottom: 12px;
        transition: background 0.3s;
    }
    .banner-ok { background: #00802b; }
    .banner-fault { background: #CC0000; animation: blink 1s infinite; }

    .voltage-table { width: 100%; border-collapse: collapse; color: white; font-size: 13px; }
    .voltage-table th { background: #2a2a2a; padding: 8px; text-align: left; }
    .voltage-table td { padding: 6px 8px; border-bottom: 1px solid #333; }
    .voltage-alarm { color: #ff4444; font-weight: bold; }
    .voltage-ok { color: #44ff44; }
</style>

<!-- ALARM BANNER -->
<div class="banner" ng-class="{'banner-ok': !msg.banner.hasFaults, 'banner-fault': msg.banner.hasFaults}">
    {{msg.banner.text}}
</div>

<!-- CFW900 GRID -->
<h3 style="color:#ccc; margin:8px 0;">CFW900 - Variable Frequency Drives</h3>
<div class="device-grid">
    <div ng-repeat="d in msg.cfwDevices" class="device-card" style="border-left-color: {{d.statusColor}}">
        <div class="device-name">{{d.name}}</div>
        <span class="device-status" ng-class="{
            'status-running': d.running,
            'status-ready': d.ready && !d.running && !d.fault,
            'status-fault': d.fault,
            'status-off': !d.ready && !d.running && !d.fault
        }">{{d.statusText}}</span>
        <span ng-if="!d.online" style="color:#ff4444; margin-left:8px;">OFFLINE</span>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
            <div>
                <div class="device-label">CURRENT</div>
                <div class="device-value">{{d.current.toFixed(1)}} <small>A</small></div>
                <div class="bar-container">
                    <div class="bar-fill" style="width:{{(d.current/25*100).toFixed(0)}}%; background:#0064DC;"></div>
                </div>
            </div>
            <div>
                <div class="device-label">FREQUENCY</div>
                <div class="device-value">{{d.frequency.toFixed(1)}} <small>Hz</small></div>
                <div class="bar-container">
                    <div class="bar-fill" style="width:{{(d.frequency/60*100).toFixed(0)}}%; background:#00B400;"></div>
                </div>
            </div>
            <div>
                <div class="device-label">DC BUS VOLTAGE</div>
                <div class="device-value" style="color:#FFD700;">{{d.dcBusVoltage.toFixed(1)}} <small>V</small></div>
                <div class="bar-container">
                    <div class="bar-fill" style="width:{{(d.dcBusVoltage/800*100).toFixed(0)}}%; background:#FFD700;"></div>
                </div>
            </div>
            <div>
                <div class="device-label">SPEED</div>
                <div class="device-value">{{d.speedRPM}} <small>RPM</small></div>
            </div>
        </div>

        <div ng-if="d.fault" style="margin-top:8px; padding:6px; background:#3a0000; border-radius:4px; color:#ff6666;">
            {{d.faultText}}
        </div>
    </div>
</div>

<!-- SSW900 GRID -->
<h3 style="color:#ccc; margin:12px 0 8px 0;">SSW900 - Soft Starters</h3>
<div class="device-grid">
    <div ng-repeat="d in msg.sswDevices" class="device-card" style="border-left-color: {{d.statusColor}}">
        <div class="device-name">{{d.name}}</div>
        <span class="device-status" ng-class="{
            'status-running': d.running,
            'status-ready': d.ready && !d.running && !d.fault && !d.starting,
            'status-starting': d.starting,
            'status-fault': d.fault,
            'status-off': !d.ready && !d.running && !d.fault && !d.starting
        }">{{d.statusText}}</span>
        <span ng-if="!d.online" style="color:#ff4444; margin-left:8px;">OFFLINE</span>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
            <div>
                <div class="device-label">CURRENT</div>
                <div class="device-value">{{d.current.toFixed(1)}} <small>A</small></div>
                <div class="bar-container">
                    <div class="bar-fill" style="width:{{(d.current/50*100).toFixed(0)}}%; background:#0064DC;"></div>
                </div>
            </div>
            <div>
                <div class="device-label">MOTOR VOLTAGE</div>
                <div class="device-value" style="color:#FFD700;">{{d.voltage.toFixed(1)}} <small>V</small></div>
                <div class="bar-container">
                    <div class="bar-fill" style="width:{{(d.voltage/500*100).toFixed(0)}}%; background:#FFD700;"></div>
                </div>
            </div>
            <div>
                <div class="device-label">POWER</div>
                <div class="device-value">{{d.power.toFixed(1)}} <small>kW</small></div>
            </div>
        </div>

        <div ng-if="d.fault" style="margin-top:8px; padding:6px; background:#3a0000; border-radius:4px; color:#ff6666;">
            {{d.faultText}}
        </div>
    </div>
</div>
`;


// ============================================================================
// VOLTAGE DETAIL HTML TEMPLATE
// Use in a ui_template node on the Voltage tab
// ============================================================================

const voltageTemplate = `
<h3 style="color:#FFD700;">CFW900 - DC Bus Voltage</h3>
<table class="voltage-table">
    <tr><th>Device</th><th>Now (V)</th><th>Min (V)</th><th>Max (V)</th><th>Avg (V)</th><th>Status</th></tr>
    <tr ng-repeat="v in msg.voltage.cfwVoltage">
        <td>{{v.name}}</td>
        <td style="font-weight:bold; font-size:16px;">{{v.now.toFixed(1)}}</td>
        <td style="color:#44aaff;">{{v.min.toFixed(1)}}</td>
        <td style="color:#ff8844;">{{v.max.toFixed(1)}}</td>
        <td>{{v.avg}}</td>
        <td ng-class="{'voltage-alarm': v.alarm, 'voltage-ok': !v.alarm}">
            {{v.alarm ? (v.overvoltage ? 'OVERVOLTAGE' : 'UNDERVOLTAGE') : 'OK'}}
        </td>
    </tr>
</table>
<p style="color:#888; font-size:12px;">Thresholds: Low = 350V | High = 750V</p>

<h3 style="color:#FFD700; margin-top:16px;">SSW900 - Motor Voltage</h3>
<table class="voltage-table">
    <tr><th>Device</th><th>Now (V)</th><th>Min (V)</th><th>Max (V)</th><th>Avg (V)</th><th>Imbal %</th><th>Status</th></tr>
    <tr ng-repeat="v in msg.voltage.sswVoltage">
        <td>{{v.name}}</td>
        <td style="font-weight:bold; font-size:16px;">{{v.now.toFixed(1)}}</td>
        <td style="color:#44aaff;">{{v.min.toFixed(1)}}</td>
        <td style="color:#ff8844;">{{v.max.toFixed(1)}}</td>
        <td>{{v.avg}}</td>
        <td ng-class="{'voltage-alarm': v.deviation > 5}">{{v.deviation ? v.deviation.toFixed(1) : '0.0'}}%</td>
        <td ng-class="{'voltage-alarm': v.alarm, 'voltage-ok': !v.alarm}">
            {{v.alarm ? (v.imbalanceAlarm ? 'IMBALANCE' : v.overvoltage ? 'HIGH' : 'LOW') : 'OK'}}
        </td>
    </tr>
</table>
<p style="color:#888; font-size:12px;">Thresholds: Low = 400V | High = 480V | Max Imbalance = 5%</p>
`;
