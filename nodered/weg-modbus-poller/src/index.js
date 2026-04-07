'use strict';

const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const chokidar = require('chokidar');
const { parse } = require('./parser');
const connections = require('./connections');
const http = require('http');

// ─── Config ──────────────────────────────────────────────────────────
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
let config = loadConfig();

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    console.log(`[CFG] Loaded ${cfg.devices.length} devices, ${(cfg.gateways || []).length} gateways`);
    return cfg;
  } catch (err) {
    console.error(`[CFG] Failed to load config: ${err.message}`);
    return { devices: [], gateways: [], pollIntervalMs: 2000, influxWriteIntervalMs: 10000,
      mqtt: { broker: 'mqtt://mosquitto:1883', topicPrefix: 'weg/drives', statusTopic: 'weg/status' },
      influxdb: { url: 'http://influxdb:8086', org: 'WEG_Monitoring', bucket: 'weg_drives', token: '' }
    };
  }
}

// ─── MQTT ────────────────────────────────────────────────────────────
const mqttBroker = process.env.MQTT_BROKER || config.mqtt.broker;
console.log(`[MQTT] Connecting to ${mqttBroker}`);
const mqttClient = mqtt.connect(mqttBroker, {
  clientId: 'weg-modbus-poller',
  will: { topic: config.mqtt.statusTopic, payload: JSON.stringify({ poller: 'offline' }), retain: true, qos: 1 }
});
mqttClient.on('connect', () => console.log('[MQTT] Connected'));
mqttClient.on('error', (err) => console.error('[MQTT] Error:', err.message));

// ─── Device State ────────────────────────────────────────────────────
const deviceStates = new Map();
const disabledCleared = new Set();
const runAccumulators = new Map();   // track running seconds per device
const commErrorCounters = new Map(); // track comm errors per device

// ─── Alarm Setpoints ────────────────────────────────────────────────
function getSetpoints(dev) {
  const sp = config.alarmSetpoints || {};
  const typeDefaults = (sp.defaults || {})[dev.type] || {};
  const overrides = (sp.overrides || {})[dev.name] || {};
  return { ...typeDefaults, ...overrides };
}

function evaluateAlarms(data, dev) {
  const sp = getSetpoints(dev);
  data.sp_currentHigh = sp.currentHigh || 0;
  data.sp_tempHigh = sp.tempHigh || 0;
  data.sp_frequencyHigh = sp.frequencyHigh || 0;
  data.sp_commErrorMax = sp.commErrorMax || 0;

  data.alarm_currentHigh = data.current > (sp.currentHigh || Infinity);
  data.alarm_tempHigh = data.motorTemp > (sp.tempHigh || Infinity);
  data.alarm_commErrors = (data.commErrors || 0) > (sp.commErrorMax || Infinity);
  data.hasAlarmSP = data.alarm_currentHigh || data.alarm_tempHigh || data.alarm_commErrors;
}

// ─── Poll Loop ───────────────────────────────────────────────────────
async function pollAll() {
  const devices = config.devices;
  if (!devices.length) return;

  // Clear retained MQTT messages for disabled devices (once per device)
  devices.forEach((dev) => {
    if (dev.enabled === false && !disabledCleared.has(dev.name)) {
      const topic = `${config.mqtt.topicPrefix}/${sanitizeTopic(dev.name)}`;
      mqttClient.publish(topic, '', { qos: 0, retain: true });
      deviceStates.delete(dev.name);
      disabledCleared.add(dev.name);
      console.log(`[POLL] Disabled device ${dev.name} — cleared MQTT retained`);
    } else if (dev.enabled !== false) {
      disabledCleared.delete(dev.name); // Re-enabled, allow future cleanup
    }
  });

  // Group by ip:port for sequential polling within each connection
  const groups = new Map();
  devices.forEach((dev, idx) => {
    if (dev.enabled === false) return; // Skip disabled devices
    const k = `${dev.ip}:${dev.port || 502}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ ...dev, index: idx });
  });

  // Poll all groups in parallel, devices within group sequentially
  const groupPromises = [];
  for (const [, devs] of groups) {
    groupPromises.push(pollGroup(devs));
  }
  await Promise.allSettled(groupPromises);

  // Poll meters (PM8000, etc) in parallel with drives
  await pollMeters();

  // Publish status summary
  publishStatus();
}

async function pollMeters() {
  const meters = config.meters || [];
  for (const m of meters) {
    if (m.enabled === false) continue;
    if (m.type !== 'PM8000') continue;
    const r = m.regs || {};
    const readF32 = async (addr) => {
      if (addr == null) return 0;
      const regs = await connections.poll(m.ip, m.port || 502, m.unitId || 1, addr - 1, 2);
      if (!regs) return null;
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(regs[0], 0);
      buf.writeUInt16BE(regs[1], 2);
      return buf.readFloatBE(0);
    };
    const voltage = await readF32(r.voltage);
    const current = await readF32(r.current);
    const power = await readF32(r.power);
    const pf = await readF32(r.pf);
    const online = voltage != null && current != null && power != null && pf != null;
    const data = {
      name: m.name, type: 'PM8000', ip: m.ip,
      online, voltage: voltage||0, current: current||0, power: power||0, pf: pf||0,
      _ts: Date.now()
    };
    const topic = `weg/meters/${sanitizeTopic(m.name)}`;
    mqttClient.publish(topic, JSON.stringify(data), { qos: 0, retain: true });
  }
}

async function pollGroup(devices) {
  for (const dev of devices) {
    const count = dev.type === 'SSW900' ? 70 : 70;
    const startAddr = dev.regOffset || 0;
    const regs = await connections.poll(dev.ip, dev.port || 502, dev.unitId, startAddr, count);

    // For SSW900 via PLC gateway, also read the status block
    let statusRegs = null;
    if (regs && dev.type === 'SSW900' && dev.statusOffset != null) {
      statusRegs = await connections.poll(dev.ip, dev.port || 502, dev.unitId, dev.statusOffset, 12);
    }

    // For CFW900, also read IGBT temperature parameters P2020/P2021/P2022
    let igbtRegs = null;
    if (regs && dev.type === 'CFW900') {
      igbtRegs = await connections.poll(dev.ip, dev.port || 502, dev.unitId, 2020, 3);
    }

    let data;
    if (regs) {
      data = parse(regs, dev, statusRegs, igbtRegs);
    } else {
      // Offline - use last known state or create offline stub
      const prev = deviceStates.get(dev.name);
      data = prev ? { ...prev, online: false, _ts: Date.now() } : {
        name: dev.name, type: dev.type, ip: dev.ip, site: dev.site,
        online: false, running: false, ready: false, fault: false,
        hasFault: false, hasAlarm: false, current: 0, frequency: 0,
        outputVoltage: 0, motorSpeed: 0, power: 0, cosPhi: 0, motorTemp: 0,
        speedRef: 0, nominalCurrent: 150, nominalVoltage: 500,
        nominalFreq: dev.type === 'SSW900' ? 0 : 70,
        faultText: '', alarmText: '', hoursEnergized: '-', hoursEnabled: '-',
        stateCode: 0, statusText: 'OFFLINE', _ts: Date.now()
      };
    }

    data.index = dev.index;

    // Track communication errors
    if (!regs) {
      commErrorCounters.set(dev.name, (commErrorCounters.get(dev.name) || 0) + 1);
    }
    data.commErrors = commErrorCounters.get(dev.name) || 0;

    // Track running hours (accumulate seconds between polls)
    const pollSec = config.pollIntervalMs / 1000;
    if (!runAccumulators.has(dev.name)) runAccumulators.set(dev.name, 0);
    if (data.running) {
      runAccumulators.set(dev.name, runAccumulators.get(dev.name) + pollSec);
    }
    data.runHours = runAccumulators.get(dev.name) / 3600;

    deviceStates.set(dev.name, data);

    // Publish to MQTT
    const topic = `${config.mqtt.topicPrefix}/${sanitizeTopic(dev.name)}`;
    mqttClient.publish(topic, JSON.stringify(data), { qos: 0, retain: true });
  }
}

function sanitizeTopic(name) {
  return name.replace(/[# +\/]/g, '_');
}

function publishStatus() {
  let online = 0, running = 0, faults = 0, offline = 0;
  const faultTexts = [];

  for (const [, d] of deviceStates) {
    if (d.online) {
      online++;
      if (d.running) running++;
      if (d.hasFault) { faults++; faultTexts.push(`${d.name}: ${d.faultText}`); }
    } else {
      offline++;
    }
  }

  const summary = {
    poller: 'online',
    total: deviceStates.size,
    online, running, faults, offline,
    faultTexts,
    connections: connections.getStats(),
    ts: Date.now()
  };

  mqttClient.publish(config.mqtt.statusTopic, JSON.stringify(summary), { qos: 0, retain: true });
}

// ─── InfluxDB Writer ─────────────────────────────────────────────────
function writeInflux() {
  const lines = [];
  const ts = Date.now() * 1000000; // nanoseconds

  for (const [, d] of deviceStates) {
    if (!d.online) continue;

    const name = (d.name || 'unknown').replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
    const ip = (d.ip || '0.0.0.0').replace(/ /g, '\\ ');
    const site = (d.site || 'unknown').replace(/ /g, '\\ ');

    const fields = [
      `motor_speed=${d.motorSpeed || 0}i`,
      `current=${d.current || 0}`,
      `voltage=${Math.round(d.outputVoltage) || 0}i`,
      `frequency=${d.frequency || 0}`,
      `power=${d.power || 0}`,
      `cos_phi=${d.cosPhi || 0}`,
      `motor_temp=${d.motorTemp || 0}`,
      `running=${d.running ? 'true' : 'false'}`,
      `state_code=${d.stateCode || 0}i`,
      `run_hours=${d.runHours || 0}`,
      `comm_errors=${d.commErrors || 0}i`
    ].join(',');

    lines.push(`drive_data,name=${name},ip=${ip},index=${d.index || 0},site=${site},type=${d.type || 'CFW900'} ${fields} ${ts}`);
  }

  if (!lines.length) return;

  const influx = config.influxdb;
  const body = lines.join('\n');
  const urlPath = `/api/v2/write?org=${encodeURIComponent(influx.org)}&bucket=${encodeURIComponent(influx.bucket)}&precision=ns`;

  const url = new URL(influx.url);
  const opts = {
    hostname: url.hostname,
    port: url.port || 8086,
    path: urlPath,
    method: 'POST',
    headers: {
      'Authorization': `Token ${influx.token}`,
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const req = http.request(opts, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      if (res.statusCode === 204) {
        // OK
      } else {
        console.error(`[INFLUX] Write error ${res.statusCode}: ${data.substring(0, 200)}`);
      }
    });
  });
  req.on('error', (err) => console.error(`[INFLUX] Request error: ${err.message}`));
  req.write(body);
  req.end();
}

// ─── Health Server ───────────────────────────────────────────────────
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      devices: config.devices.length,
      online: [...deviceStates.values()].filter(d => d.online).length
    }));
  } else if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const obj = {};
    for (const [k, v] of deviceStates) obj[k] = v;
    res.end(JSON.stringify(obj, null, 2));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
healthServer.listen(3100, () => console.log('[HEALTH] Listening on :3100'));

// ─── Config Hot Reload ───────────────────────────────────────────────
let reloadDebounce = null;
chokidar.watch(CONFIG_PATH, { ignoreInitial: true, usePolling: true, interval: 3000 }).on('change', () => {
  if (reloadDebounce) clearTimeout(reloadDebounce);
  reloadDebounce = setTimeout(() => {
    console.log('[CFG] Config file changed, reloading...');
    const oldNames = new Set(config.devices.map(d => d.name));
    config = loadConfig();
    const newNames = new Set(config.devices.map(d => d.name));

    // Clear MQTT retained messages for deleted devices
    for (const name of oldNames) {
      if (!newNames.has(name)) {
        const topic = `${config.mqtt.topicPrefix}/${sanitizeTopic(name)}`;
        mqttClient.publish(topic, '', { qos: 0, retain: true });
        deviceStates.delete(name);
        disabledCleared.delete(name);
        console.log(`[CFG] Device removed: ${name} — cleared MQTT retained`);
      }
    }

    // Close connections to IPs no longer in config
    const activeIPs = new Set(config.devices.filter(d => d.enabled !== false).map(d => `${d.ip}:${d.port || 502}`));
    const stats = connections.getStats();
    for (const k of Object.keys(stats)) {
      if (!activeIPs.has(k)) {
        console.log(`[CFG] Closing unused connection: ${k}`);
      }
    }
  }, 500);
});

// ─── Start ───────────────────────────────────────────────────────────
console.log('[POLLER] WEG Modbus Poller starting...');
console.log(`[POLLER] Poll interval: ${config.pollIntervalMs}ms, InfluxDB write: ${config.influxWriteIntervalMs}ms`);

// ─── Health File (for Docker healthcheck) ───────────────────────────
function writeHealthFile() {
  try { fs.writeFileSync('/tmp/poller-healthy', Date.now().toString()); } catch (e) {}
}

// Wait for MQTT connection before starting polls
mqttClient.on('connect', () => {
  // Start poll loop
  setInterval(() => {
    pollAll()
      .then(() => writeHealthFile())
      .catch(err => console.error('[POLL] Error:', err.message));
  }, config.pollIntervalMs);

  // Start InfluxDB write loop
  setInterval(writeInflux, config.influxWriteIntervalMs);

  // Initial poll
  setTimeout(() => pollAll().catch(err => console.error('[POLL] Initial error:', err.message)), 1000);

  writeHealthFile();
});

// ─── Graceful Shutdown ───────────────────────────────────────────────
function shutdown() {
  console.log('[POLLER] Shutting down...');
  connections.closeAll();
  mqttClient.end();
  healthServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
