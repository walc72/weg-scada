/**
 * fix_alerts_real.js
 * Adds alarm detection, rate limiting, and Telegram/Email notification nodes
 * to the existing MQTT-based flows.json.
 *
 * Connects to the existing MQTT data flow:
 *   weg_mqtt_drives_in → weg_mqtt_bridge → [existing...] + [alarm chain]
 *
 * Prerequisites (run inside weg-nodered container):
 *   cd /data && npm install node-red-contrib-telegrambot node-red-node-email
 *
 * Apply:
 *   node /data/fix_alerts_real.js
 *
 * After applying, configure in Node-RED editor:
 *   - Double-click "Telegram Bot Config" → set bot token
 *   - Set flow context: flow.set("telegramChatId", "YOUR_CHAT_ID")
 *   - Double-click "Email Alert" → set SMTP credentials and destination
 */

const fs = require('fs');
const FLOWS_PATH = '/data/flows.json';

const flows = JSON.parse(fs.readFileSync(FLOWS_PATH, 'utf8'));

// Check if alarm nodes already exist
if (flows.find(n => n.id === 'weg_alarm_detector')) {
  console.log('⚠️  Alarm nodes already exist. Skipping.');
  process.exit(0);
}

const TAB = 'weg_d2_tab';

// Find the MQTT bridge node to tap into its output
const bridge = flows.find(n => n.id === 'weg_mqtt_bridge');
if (!bridge) {
  console.error('❌ Cannot find weg_mqtt_bridge node');
  process.exit(1);
}

// Add alarm detector as additional output of the bridge
if (!bridge.wires[0]) bridge.wires[0] = [];
bridge.wires[0].push('weg_alarm_detector');

// ─── New Nodes ──────────────────────────────────────────────────────

// 1. Alarm Detector - checks each device update for alarm conditions
flows.push({
  id: 'weg_alarm_detector',
  type: 'function',
  z: TAB,
  name: 'Alarm Detector',
  func: `// Detect alarm conditions from device data
const d = msg.payload;
if (!d || !d.name) return null;

const prev = flow.get('prevAlarms_' + d.name) || {};
const alarms = [];

// Device fault
if (d.hasFault && !prev.hasFault) {
    alarms.push({ device: d.name, type: 'FAULT', text: d.faultText || 'Falla detectada', voltage: d.outputVoltage, current: d.current });
}

// Setpoint alarms (evaluated by poller)
if (d.alarm_currentHigh && !prev.alarm_currentHigh) {
    alarms.push({ device: d.name, type: 'CORRIENTE ALTA', text: 'Corriente ' + (d.current||0).toFixed(1) + 'A supera SP ' + (d.sp_currentHigh||0) + 'A', voltage: d.outputVoltage, current: d.current });
}
if (d.alarm_tempHigh && !prev.alarm_tempHigh) {
    alarms.push({ device: d.name, type: 'TEMPERATURA ALTA', text: 'Temp ' + (d.motorTemp||0).toFixed(1) + '°C supera SP ' + (d.sp_tempHigh||0) + '°C', voltage: d.outputVoltage, current: d.current });
}
if (d.alarm_voltageHigh && !prev.alarm_voltageHigh) {
    alarms.push({ device: d.name, type: 'VOLTAJE ALTO', text: 'Voltaje ' + (d.outputVoltage||0) + 'V supera SP ' + (d.sp_voltageHigh||0) + 'V', voltage: d.outputVoltage, current: d.current });
}
if (d.alarm_voltageLow && !prev.alarm_voltageLow) {
    alarms.push({ device: d.name, type: 'VOLTAJE BAJO', text: 'Voltaje ' + (d.outputVoltage||0) + 'V bajo SP ' + (d.sp_voltageLow||0) + 'V', voltage: d.outputVoltage, current: d.current });
}

// Communication lost
if (!d.online && prev.online !== false && prev.online !== undefined) {
    alarms.push({ device: d.name, type: 'COMM LOST', text: 'Comunicacion perdida (' + (d.commErrors||0) + ' errores)', voltage: 0, current: 0 });
}

// Check for cleared alarms
const cleared = [];
if (!d.hasFault && prev.hasFault) cleared.push({ device: d.name, type: 'FAULT', text: 'Falla resuelta' });
if (!d.alarm_currentHigh && prev.alarm_currentHigh) cleared.push({ device: d.name, type: 'CORRIENTE ALTA', text: 'Normalizada' });
if (!d.alarm_tempHigh && prev.alarm_tempHigh) cleared.push({ device: d.name, type: 'TEMPERATURA ALTA', text: 'Normalizada' });
if (d.online && prev.online === false) cleared.push({ device: d.name, type: 'COMM LOST', text: 'Comunicacion restablecida' });

// Save current state
flow.set('prevAlarms_' + d.name, {
    hasFault: d.hasFault, online: d.online,
    alarm_currentHigh: d.alarm_currentHigh, alarm_tempHigh: d.alarm_tempHigh,
    alarm_voltageHigh: d.alarm_voltageHigh, alarm_voltageLow: d.alarm_voltageLow
});

const notifications = [];
if (alarms.length) notifications.push({ type: 'alarm', alarms });
if (cleared.length) notifications.push({ type: 'clear', alarms: cleared });

if (!notifications.length) return null;
msg.notifications = notifications;
return msg;`,
  outputs: 1,
  timeout: '',
  noerr: 0,
  x: 350,
  y: 650,
  wires: [['weg_rate_limiter']]
});

// 2. Rate Limiter - 5 min cooldown per device+type
flows.push({
  id: 'weg_rate_limiter',
  type: 'function',
  z: TAB,
  name: 'Rate Limiter (5min)',
  func: `const COOLDOWN = 5 * 60 * 1000; // 5 minutes
const now = Date.now();
const lastSent = flow.get('notifCooldown') || {};

const filtered = [];
msg.notifications.forEach(n => {
    const passed = n.alarms.filter(a => {
        if (n.type === 'clear') return true; // always send clears
        const k = a.device + '_' + a.type;
        if (lastSent[k] && (now - lastSent[k]) < COOLDOWN) return false;
        lastSent[k] = now;
        return true;
    });
    if (passed.length) filtered.push({ type: n.type, alarms: passed });
});

flow.set('notifCooldown', lastSent);
if (!filtered.length) return null;
msg.notifications = filtered;
return msg;`,
  outputs: 1,
  timeout: '',
  noerr: 0,
  x: 570,
  y: 650,
  wires: [['weg_format_telegram', 'weg_format_email']]
});

// 3. Format for Telegram
flows.push({
  id: 'weg_format_telegram',
  type: 'function',
  z: TAB,
  name: 'Format Telegram',
  func: `const notifs = msg.notifications || [];
if (!notifs.length) return null;

const lines = [];
notifs.forEach(n => {
    if (n.type === 'alarm') {
        lines.push('🚨 *ALARMA WEG SCADA*');
        lines.push('📅 ' + new Date().toLocaleString('es-PY'));
        lines.push('');
        n.alarms.forEach(a => {
            lines.push('🔴 *' + a.device + '*');
            lines.push('   Tipo: ' + a.type);
            lines.push('   ' + a.text);
            if (a.voltage) lines.push('   ⚡ Voltage: ' + a.voltage + ' V');
            if (a.current) lines.push('   🔌 Current: ' + a.current + ' A');
        });
    } else {
        lines.push('✅ *ALARMA RESUELTA*');
        lines.push('📅 ' + new Date().toLocaleString('es-PY'));
        lines.push('');
        n.alarms.forEach(a => {
            lines.push('🟢 *' + a.device + '* — ' + a.type);
            if (a.text) lines.push('   ' + a.text);
        });
    }
});

const chatId = flow.get('telegramChatId') || '';
msg.payload = {
    chatId: chatId,
    type: 'message',
    content: lines.join('\\n'),
    options: { parse_mode: 'Markdown' }
};
return msg;`,
  outputs: 1,
  timeout: '',
  noerr: 0,
  x: 790,
  y: 630,
  wires: [['weg_telegram_out']]
});

// 4. Format for Email
flows.push({
  id: 'weg_format_email',
  type: 'function',
  z: TAB,
  name: 'Format Email',
  func: `const notifs = msg.notifications || [];
if (!notifs.length) return null;

const isAlarm = notifs.some(n => n.type === 'alarm');
const allAlarms = notifs.flatMap(n => n.alarms || []);

const rows = allAlarms.map(a =>
    '<tr style="border-bottom:1px solid #ddd">' +
    '<td style="padding:8px;font-weight:bold">' + (a.device||'') + '</td>' +
    '<td style="padding:8px">' + (a.type||'') + '</td>' +
    '<td style="padding:8px">' + (a.text||'') + '</td>' +
    '<td style="padding:8px">' + (a.voltage||'-') + ' V</td>' +
    '<td style="padding:8px">' + (a.current||'-') + ' A</td>' +
    '</tr>'
).join('');

const color = isAlarm ? '#d32f2f' : '#2e7d32';
const title = isAlarm ? '🚨 ALARMA WEG SCADA' : '✅ Alarma Resuelta';

msg.topic = isAlarm
    ? '[WEG SCADA] ALARMA - ' + allAlarms.map(a => a.device).join(', ')
    : '[WEG SCADA] Resuelta - ' + allAlarms.map(a => a.device).join(', ');

msg.payload = '<div style="font-family:Arial,sans-serif;max-width:700px">' +
    '<h2 style="color:' + color + '">' + title + '</h2>' +
    '<p>Fecha: ' + new Date().toLocaleString('es-PY') + '</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
    '<tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Drive</th>' +
    '<th style="padding:8px;text-align:left">Tipo</th>' +
    '<th style="padding:8px;text-align:left">Detalle</th>' +
    '<th style="padding:8px;text-align:left">Voltaje</th>' +
    '<th style="padding:8px;text-align:left">Corriente</th></tr>' +
    rows + '</table>' +
    '<p style="color:#666;font-size:12px;margin-top:20px">WEG SCADA Monitoring — Tecnoelectric</p>' +
    '</div>';

return msg;`,
  outputs: 1,
  timeout: '',
  noerr: 0,
  x: 790,
  y: 670,
  wires: [['weg_email_out']]
});

// 5. Telegram Bot Config
flows.push({
  id: 'weg_telegram_bot_config',
  type: 'telegram bot',
  botname: 'WEG_SCADA_Bot',
  usernames: '',
  chatids: '',
  baseapiurl: '',
  updatemode: 'polling',
  pollinterval: '3000',
  usesocks: false,
  sockshost: '',
  socksport: '6667',
  socksusername: 'anonymous',
  sockspassword: '',
  bothost: '',
  botpath: '',
  localbotport: '',
  verboselogging: false
});

// 6. Telegram Sender
flows.push({
  id: 'weg_telegram_out',
  type: 'telegram sender',
  z: TAB,
  name: 'Telegram Alert',
  bot: 'weg_telegram_bot_config',
  haserroroutput: false,
  outputs: 1,
  x: 1010,
  y: 630,
  wires: [[]]
});

// 7. Email Node
flows.push({
  id: 'weg_email_out',
  type: 'e-mail',
  z: TAB,
  name: 'Email Alert',
  server: 'smtp.gmail.com',
  port: '587',
  secure: false,
  tls: true,
  dname: 'WEG Monitoring',
  to: '',       // SET DESTINATION EMAIL in Node-RED editor
  userid: '',   // SET SMTP USER
  password: '', // SET SMTP APP PASSWORD
  x: 1010,
  y: 670,
  wires: []
});

// 8. Comment separator
flows.push({
  id: 'weg_comment_alarms',
  type: 'comment',
  z: TAB,
  name: '─── ALARM NOTIFICATIONS ───',
  info: 'Alarm chain: MQTT data → Detector → Rate Limiter → Format → Send\nSetpoints come from config.json via the modbus poller.',
  x: 350,
  y: 610,
  wires: []
});

// ─── Save ───────────────────────────────────────────────────────────
fs.writeFileSync(FLOWS_PATH, JSON.stringify(flows, null, 2));
console.log('✅ Alarm nodes added to flows.json:');
console.log('   - weg_alarm_detector: detects faults, SP violations, comm loss');
console.log('   - weg_rate_limiter: 5-min cooldown per device/type');
console.log('   - weg_format_telegram + weg_telegram_out');
console.log('   - weg_format_email + weg_email_out');
console.log('   - Connected to weg_mqtt_bridge output');
console.log('');
console.log('⚠️  CONFIGURE IN NODE-RED EDITOR:');
console.log('   1. Telegram Bot → set bot token');
console.log('   2. flow.set("telegramChatId", "YOUR_CHAT_ID")');
console.log('   3. Email Alert → set SMTP user/password and destination');
