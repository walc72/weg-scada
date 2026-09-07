'use strict';

const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const chokidar = require('chokidar');
const { parse } = require('./parser');
const connections = require('./connections');
const waveform = require('./waveform');
const http = require('http');

// ─── Config ──────────────────────────────────────────────────────────
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
let config = loadConfig();

// Si la carga falla o la config no tiene la forma minima, se conserva la
// config anterior (prev): antes un archivo a medio escribir o corrupto
// dejaba al poller con lista de dispositivos vacia y borraba los retained.
function loadConfig(prev = null) {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    if (!Array.isArray(cfg.devices)) throw new Error('config.devices no es un array');
    console.log(`[CFG] Loaded ${cfg.devices.length} devices, ${(cfg.gateways || []).length} gateways`);
    return cfg;
  } catch (err) {
    console.error(`[CFG] Failed to load config: ${err.message}`);
    if (prev) {
      console.warn('[CFG] Manteniendo la config anterior en memoria');
      return prev;
    }
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
const meterStates = new Map();
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

  // Drives (por grupo ip:port) y medidores, todos en paralelo. Cada
  // dispositivo/medidor de una IP distinta corre concurrente, asi que el
  // ciclo dura lo del mas lento y no la suma de los timeouts de los caidos.
  const tasks = [];
  for (const [, devs] of groups) {
    tasks.push(pollGroup(devs));
  }
  const meters = (config.meters || []).filter(
    (m) => m.enabled !== false && (m.type === 'PM8000' || m.type === 'PM7400')
  );
  for (const m of meters) {
    tasks.push(pollMeter(m));
  }
  await Promise.allSettled(tasks);

  // Publish status summary
  publishStatus();
}

async function pollMeter(m) {
  const r = m.regs || {};
  // Las 4 lecturas comparten el socket Modbus del medidor -> secuenciales,
  // pero el cooldown de conexion hace que un medidor caido falle al instante
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
  // Frecuencia opcional: solo si el medidor tiene el registro configurado
  const frequency = r.freq != null ? await readF32(r.freq) : null;
  const online = voltage != null && current != null && power != null && pf != null;
  const data = {
    name: m.name, type: m.type, ip: m.ip,
    online, voltage: voltage || 0, current: current || 0, power: power || 0, pf: pf || 0,
    frequency: frequency || 0,
    _ts: Date.now()
  };
  meterStates.set(m.name, data);
  const topic = `weg/meters/${sanitizeTopic(m.name)}`;
  mqttClient.publish(topic, JSON.stringify(data), { qos: 0, retain: true });
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

    // Track communication errors (se resetea al recuperarse la comunicacion)
    if (!regs) {
      commErrorCounters.set(dev.name, (commErrorCounters.get(dev.name) || 0) + 1);
    } else {
      commErrorCounters.set(dev.name, 0);
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
      `igbt_temp=${d.igbtTemp || 0}`,
      `scr_temp=${d.scrTemp || 0}`,
      `running=${d.running ? 'true' : 'false'}`,
      `state_code=${d.stateCode || 0}i`,
      `run_hours=${d.runHours || 0}`,
      `comm_errors=${d.commErrors || 0}i`
    ].join(',');

    lines.push(`drive_data,name=${name},ip=${ip},index=${d.index || 0},site=${site},type=${d.type || 'CFW900'} ${fields} ${ts}`);
  }

  // PM8000 / meters
  for (const [, m] of meterStates) {
    if (!m.online) continue;
    const name = (m.name || 'meter').replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
    const ip = (m.ip || '0.0.0.0').replace(/ /g, '\\ ');
    const fields = [
      `voltage=${m.voltage || 0}`,
      `current=${m.current || 0}`,
      `power=${m.power || 0}`,
      `pf=${m.pf || 0}`
    ].join(',');
    lines.push(`meter_data,name=${name},ip=${ip},type=${m.type || 'PM8000'} ${fields} ${ts}`);
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
      'Authorization': `Token ${process.env.INFLUXDB_TOKEN || influx.token}`,
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
  req.setTimeout(8000, () => {
    console.error('[INFLUX] Request timeout');
    req.destroy();
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
  } else if (req.url.startsWith('/waveform/')) {
    const name = decodeURIComponent(req.url.slice('/waveform/'.length));
    const meter = (config.meters || []).find(m => m.name === name && m.enabled !== false);
    if (!meter) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Medidor no encontrado o deshabilitado' }));
      return;
    }
    waveform.readWaveform(meter)
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        console.error(`[WAVEFORM] Error leyendo ${name}: ${err.message}`);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Error leyendo forma de onda: ${err.message}` }));
      });
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
    config = loadConfig(config);
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
    const activeIPs = new Set([
      ...config.devices.filter(d => d.enabled !== false).map(d => `${d.ip}:${d.port || 502}`),
      ...(config.meters || []).filter(m => m.enabled !== false).map(m => `${m.ip}:${m.port || 502}`)
    ]);
    const stats = connections.getStats();
    for (const k of Object.keys(stats)) {
      if (!activeIPs.has(k)) {
        connections.closeOne && connections.closeOne(k);
        console.log(`[CFG] Closed unused connection: ${k}`);
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

// Wait for MQTT connection before starting polls.
// once(): mqtt.js dispara 'connect' en CADA reconexion — con on() cada
// reinicio del broker duplicaba los loops de polling y escritura a InfluxDB.
mqttClient.once('connect', () => {
  // Start poll loop with concurrency lock — skip cycle if previous still running
  let polling = false;
  let skipCount = 0;
  setInterval(() => {
    if (polling) {
      skipCount++;
      if (skipCount % 10 === 1) console.warn(`[POLL] Ciclo anterior aun corriendo, skips=${skipCount}`);
      return;
    }
    polling = true;
    const t0 = Date.now();
    pollAll()
      .then(() => writeHealthFile())
      .catch(err => console.error('[POLL] Error:', err.message))
      .finally(() => {
        polling = false;
        const dt = Date.now() - t0;
        if (dt > config.pollIntervalMs) console.warn(`[POLL] Ciclo tardo ${dt}ms (> ${config.pollIntervalMs}ms)`);
      });
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
  waveform.closeAll();
  mqttClient.end();
  healthServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
