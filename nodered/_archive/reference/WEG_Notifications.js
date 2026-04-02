// ============================================================================
// WEG NOTIFICATIONS - Telegram + Email
// Node-RED Function Nodes for alarm notifications
// ============================================================================
// Required palettes:
//   node-red-contrib-telegrambot
//   node-red-node-email
// ============================================================================


// ============================================================================
// FUNCTION NODE: "Alarm Detector"
// Detects NEW faults and generates notification messages
// Connect AFTER the parsers (receives flow context with device data)
// ============================================================================

// --- Alarm Detector ---
// Compares current faults with previous scan to detect NEW alarms only
// Prevents repeated notifications for the same fault

const cfwDevices = flow.get("cfwDevices") || [];
const sswDevices = flow.get("sswDevices") || [];
const prevFaults = flow.get("activeFaults") || {};
const currentFaults = {};
const newAlarms = [];
const clearedAlarms = [];

// Check CFW900
cfwDevices.forEach((d, i) => {
    const key = `CFW900_${i + 1}`;

    if (d.fault) {
        currentFaults[key] = {
            device: d.name,
            type: "FAULT",
            text: d.faultText,
            current: d.current,
            voltage: d.dcBusVoltage,
            frequency: d.frequency
        };
        // Only notify if this is a NEW fault
        if (!prevFaults[key]) {
            newAlarms.push(currentFaults[key]);
        }
    } else if (!d.online && d.commErrors > 5) {
        currentFaults[key] = {
            device: d.name,
            type: "COMM_LOST",
            text: "Communication Lost",
            current: 0,
            voltage: 0,
            frequency: 0
        };
        if (!prevFaults[key]) {
            newAlarms.push(currentFaults[key]);
        }
    }

    // Voltage alarm (independent)
    const vKey = `CFW900_V_${i + 1}`;
    if (d.dcBusVoltage > 750 || (d.dcBusVoltage < 350 && d.dcBusVoltage > 0)) {
        currentFaults[vKey] = {
            device: d.name,
            type: "VOLTAGE",
            text: d.dcBusVoltage > 750 ? "DC Bus OVERVOLTAGE" : "DC Bus UNDERVOLTAGE",
            voltage: d.dcBusVoltage
        };
        if (!prevFaults[vKey]) {
            newAlarms.push(currentFaults[vKey]);
        }
    }
});

// Check SSW900
sswDevices.forEach((d, i) => {
    const key = `SSW900_${i + 1}`;

    if (d.fault) {
        currentFaults[key] = {
            device: d.name,
            type: "FAULT",
            text: d.faultText,
            current: d.current,
            voltage: d.voltage,
            power: d.power
        };
        if (!prevFaults[key]) {
            newAlarms.push(currentFaults[key]);
        }
    } else if (!d.online && d.commErrors > 5) {
        currentFaults[key] = {
            device: d.name,
            type: "COMM_LOST",
            text: "Communication Lost"
        };
        if (!prevFaults[key]) {
            newAlarms.push(currentFaults[key]);
        }
    }

    // Voltage alarm
    const vKey = `SSW900_V_${i + 1}`;
    if (d.voltage > 480 || (d.voltage < 400 && d.voltage > 0)) {
        currentFaults[vKey] = {
            device: d.name,
            type: "VOLTAGE",
            text: d.voltage > 480 ? "Motor OVERVOLTAGE" : "Motor UNDERVOLTAGE",
            voltage: d.voltage
        };
        if (!prevFaults[vKey]) {
            newAlarms.push(currentFaults[vKey]);
        }
    }
});

// Detect cleared faults
Object.keys(prevFaults).forEach(key => {
    if (!currentFaults[key]) {
        clearedAlarms.push(prevFaults[key]);
    }
});

// Save current state
flow.set("activeFaults", currentFaults);

// Build notification messages
const messages = [];

if (newAlarms.length > 0) {
    messages.push({
        type: "alarm",
        alarms: newAlarms
    });
}

if (clearedAlarms.length > 0) {
    messages.push({
        type: "clear",
        alarms: clearedAlarms
    });
}

if (messages.length > 0) {
    msg.notifications = messages;
    return msg;
}

return null; // No new alarms = no output


// ============================================================================
// FUNCTION NODE: "Format Telegram Message"
// Input: msg.notifications from Alarm Detector
// Output: msg.payload.content = formatted Telegram text
// ============================================================================

// --- Format Telegram ---
const notifications = msg.notifications || [];
const lines = [];
const now = new Date().toLocaleString();

notifications.forEach(n => {
    if (n.type === "alarm") {
        lines.push("🚨 *WEG ALARM*");
        lines.push(`📅 ${now}`);
        lines.push("");

        n.alarms.forEach(a => {
            lines.push(`🔴 *${a.device}*`);
            lines.push(`   Type: ${a.type}`);
            lines.push(`   Detail: ${a.text}`);

            if (a.current !== undefined) lines.push(`   Current: ${a.current} A`);
            if (a.voltage !== undefined) lines.push(`   Voltage: ${a.voltage} V`);
            if (a.frequency !== undefined) lines.push(`   Frequency: ${a.frequency} Hz`);
            lines.push("");
        });

        // Summary
        const totalFaults = Object.keys(flow.get("activeFaults") || {}).length;
        lines.push(`⚠️ Total active faults: ${totalFaults}`);

    } else if (n.type === "clear") {
        lines.push("✅ *WEG ALARM CLEARED*");
        lines.push(`📅 ${now}`);
        lines.push("");

        n.alarms.forEach(a => {
            lines.push(`🟢 *${a.device}* - ${a.text} → CLEARED`);
        });
    }
});

msg.payload = {
    chatId: flow.get("telegramChatId"),     // Set in flow context or config node
    type: "message",
    content: lines.join("\n"),
    options: {
        parse_mode: "Markdown"
    }
};

return msg;


// ============================================================================
// FUNCTION NODE: "Format Email"
// Input: msg.notifications from Alarm Detector
// Output: msg for email node
// ============================================================================

// --- Format Email ---
const notifs = msg.notifications || [];
const timestamp = new Date().toLocaleString();
let subject = "";
let htmlBody = "";

notifs.forEach(n => {
    if (n.type === "alarm") {
        const deviceNames = n.alarms.map(a => a.device).join(", ");
        subject = `🚨 WEG ALARM: ${deviceNames}`;

        htmlBody = `
        <html>
        <body style="font-family: Arial, sans-serif; background: #1a1a1a; color: #ffffff; padding: 20px;">
            <div style="background: #CC0000; padding: 15px; border-radius: 8px; margin-bottom: 16px;">
                <h2 style="margin:0; color: white;">🚨 WEG Drive Alarm</h2>
                <p style="margin:4px 0 0 0; color: #ffcccc;">${timestamp}</p>
            </div>

            <table style="width:100%; border-collapse: collapse; background: #2a2a2a; border-radius: 8px;">
                <tr style="background: #333;">
                    <th style="padding:10px; text-align:left; color:#ccc;">Device</th>
                    <th style="padding:10px; text-align:left; color:#ccc;">Alarm Type</th>
                    <th style="padding:10px; text-align:left; color:#ccc;">Detail</th>
                    <th style="padding:10px; text-align:left; color:#FFD700;">Voltage</th>
                    <th style="padding:10px; text-align:left; color:#ccc;">Current</th>
                </tr>
                ${n.alarms.map(a => `
                <tr style="border-bottom: 1px solid #444;">
                    <td style="padding:10px; font-weight:bold; color:#ff6666;">${a.device}</td>
                    <td style="padding:10px;">${a.type}</td>
                    <td style="padding:10px;">${a.text}</td>
                    <td style="padding:10px; color:#FFD700; font-weight:bold;">${a.voltage !== undefined ? a.voltage + ' V' : '-'}</td>
                    <td style="padding:10px;">${a.current !== undefined ? a.current + ' A' : '-'}</td>
                </tr>`).join("")}
            </table>

            <div style="background: #333; padding: 12px; border-radius: 8px; margin-top: 16px;">
                <p style="margin:0; color: #ff8888;">
                    ⚠️ Total active faults: ${Object.keys(flow.get("activeFaults") || {}).length}
                </p>
            </div>

            <p style="color: #666; font-size: 12px; margin-top: 20px;">
                WEG Monitoring System — Node-RED Dashboard<br>
                PLC: M241 TM241CEC24T
            </p>
        </body>
        </html>`;

    } else if (n.type === "clear") {
        const deviceNames = n.alarms.map(a => a.device).join(", ");
        subject = `✅ WEG CLEARED: ${deviceNames}`;

        htmlBody = `
        <html>
        <body style="font-family: Arial, sans-serif; background: #1a1a1a; color: #ffffff; padding: 20px;">
            <div style="background: #00802b; padding: 15px; border-radius: 8px;">
                <h2 style="margin:0; color: white;">✅ Alarm Cleared</h2>
                <p style="margin:4px 0 0 0; color: #ccffcc;">${timestamp}</p>
            </div>
            <ul style="margin-top:16px;">
                ${n.alarms.map(a => `<li style="margin:8px 0;"><strong>${a.device}</strong> — ${a.text} → CLEARED</li>`).join("")}
            </ul>
        </body>
        </html>`;
    }
});

msg.topic = subject;
msg.payload = htmlBody;
return msg;


// ============================================================================
// FUNCTION NODE: "Rate Limiter"
// Prevents spam: max 1 notification per device per 5 minutes
// Place BEFORE Telegram/Email nodes
// ============================================================================

// --- Rate Limiter ---
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastSent = flow.get("notifCooldown") || {};
const now = Date.now();

const notifications = msg.notifications || [];
const filtered = [];

notifications.forEach(n => {
    const filteredAlarms = n.alarms.filter(a => {
        const key = `${a.device}_${a.type}`;
        if (lastSent[key] && (now - lastSent[key]) < COOLDOWN_MS) {
            return false; // Skip, still in cooldown
        }
        lastSent[key] = now;
        return true;
    });

    if (filteredAlarms.length > 0) {
        filtered.push({ type: n.type, alarms: filteredAlarms });
    }
});

flow.set("notifCooldown", lastSent);

if (filtered.length > 0) {
    msg.notifications = filtered;
    return msg;
}

return null; // All filtered out


// ============================================================================
// FUNCTION NODE: "Daily Summary"
// Generates a daily report at a scheduled time
// Connect to an inject node set to fire at 06:00 AM daily
// ============================================================================

// --- Daily Summary ---
const cfwDev = flow.get("cfwDevices") || [];
const sswDev = flow.get("sswDevices") || [];
const vStats = flow.get("voltageStats") || { cfw: [{},{},{},{}], ssw: [{},{},{},{}] };
const totalFaults = Object.keys(flow.get("activeFaults") || {}).length;
const date = new Date().toLocaleDateString();

let report = `📊 *WEG Daily Report — ${date}*\n\n`;

// CFW900 summary
report += "*CFW900 Drives:*\n";
cfwDev.forEach((d, i) => {
    const icon = d.fault ? "🔴" : d.running ? "🔵" : d.ready ? "🟢" : "⚪";
    report += `${icon} ${d.name}: ${d.statusText}`;
    report += ` | ${d.current}A | ${d.frequency}Hz`;
    report += ` | DC: ${d.dcBusVoltage}V`;
    if (vStats.cfw[i] && vStats.cfw[i].count > 0) {
        report += ` (min:${vStats.cfw[i].min.toFixed(0)} max:${vStats.cfw[i].max.toFixed(0)})`;
    }
    report += "\n";
});

report += "\n*SSW900 Soft Starters:*\n";
sswDev.forEach((d, i) => {
    const icon = d.fault ? "🔴" : d.running ? "🔵" : d.starting ? "🟡" : d.ready ? "🟢" : "⚪";
    report += `${icon} ${d.name}: ${d.statusText}`;
    report += ` | ${d.current}A | ${d.voltage}V | ${d.power}kW`;
    if (vStats.ssw[i] && vStats.ssw[i].count > 0) {
        report += ` (min:${vStats.ssw[i].min.toFixed(0)} max:${vStats.ssw[i].max.toFixed(0)})`;
    }
    report += "\n";
});

report += `\n⚠️ Active faults: ${totalFaults}`;
report += "\n📁 CSV log saved to disk";

// Output for Telegram
msg.payload = {
    chatId: flow.get("telegramChatId"),
    type: "message",
    content: report,
    options: { parse_mode: "Markdown" }
};

return msg;
