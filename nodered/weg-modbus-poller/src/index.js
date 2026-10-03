'use strict';

const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const chokidar = require('chokidar');
const { parse } = require('./parser');
const connections = require('./connections');
const waveform = require('./waveform');
const http = require('http');
const { sanitizeTopic, topicsToClear } = require('./retained');
const { offlineState } = require('./offline');
const { createScheduler, commDecision, createRetryGate } = require('./scheduler');
const offlineRetry = createRetryGate();

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
const commErrorCounters = new Map(); // lecturas fallidas seguidas por equipo (0 = anduvo)
const meterFailCounters = new Map(); // ídem por medidor
const lastPollAt = new Map();        // nombre -> ms de la última lectura publicada (horas de marcha)
const commDownSince = new Map();     // nombre -> ms en que se lo dio por caído (para el log)

// Log de transiciones de comunicación (caída confirmada y vuelta, con duración)
function logComm(name, decision, failures) {
  if (decision === 'offline' && !commDownSince.has(name)) {
    commDownSince.set(name, Date.now());
    console.warn(`[COMM] ${name}: sin respuesta (${failures} lecturas seguidas) → OFFLINE`);
  } else if (decision === 'online' && commDownSince.has(name)) {
    const s = Math.round((Date.now() - commDownSince.get(name)) / 1000);
    commDownSince.delete(name);
    console.log(`[COMM] ${name}: volvió tras ${s} s`);
  }
}

// ─── Alarm Setpoints ────────────────────────────────────────────────
function getSetpoints(dev) {
  const sp = config.alarmSetpoints || {};
  const typeDefaults = (sp.defaults || {})[dev.type] || {};
  const overrides = (sp.overrides || {})[dev.name] || {};
  return { ...typeDefaults, ...overrides };
}

// Alarmas por setpoint (umbrales configurables). Complementan a la alarma
// interna del drive (hasAlarm). Se publican en el objeto del drive (camelCase,
// igual que el resto de los campos) y las consume el frontend.
function evaluateAlarms(data, dev) {
  const sp = getSetpoints(dev);
  // Temperatura relevante: IGBT en CFW, SCR en SSW (motorTemp suele venir 0).
  const temp = dev.type === 'SSW900' ? (data.scrTemp || 0) : (data.igbtTemp || 0);
  // Umbrales efectivos (0 o ausente = sin límite → no dispara)
  data.spCurrentHigh = sp.currentHigh || 0;
  data.spTempHigh = sp.tempHigh || 0;
  data.spCommErrorMax = sp.commErrorMax || 0;

  if (!data.online) {
    data.alarmCurrentHigh = false;
    data.alarmTempHigh = false;
    data.alarmCommHigh = false;
    data.hasAlarmSp = false;
    return;
  }
  data.alarmCurrentHigh = data.spCurrentHigh > 0 && (data.current || 0) > data.spCurrentHigh;
  data.alarmTempHigh = data.spTempHigh > 0 && temp > data.spTempHigh;
  data.alarmCommHigh = data.spCommErrorMax > 0 && (data.commErrors || 0) > data.spCommErrorMax;
  data.hasAlarmSp = data.alarmCurrentHigh || data.alarmTempHigh || data.alarmCommHigh;
}

// ─── Poll Loop ───────────────────────────────────────────────────────
// Borra los retained de equipos desactivados (una vez por equipo)
function syncDisabled() {
  (config.devices || []).forEach((dev) => {
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

}

// Grupos por conexión (ip:port): lo que comparte socket Modbus se lee en
// secuencia; cada grupo corre a su propio ritmo (ver scheduler.js).
function getGroups() {
  syncDisabled();
  const groups = new Map();
  const add = (k) => { if (!groups.has(k)) groups.set(k, { devs: [], meters: [] }); return groups.get(k); };
  (config.devices || []).forEach((dev, idx) => {
    if (dev.enabled === false) return;
    const c = resolveConn(dev);
    add(`${c.ip}:${c.port}`).devs.push({ ...dev, index: idx });
  });
  (config.meters || [])
    .filter((m) => m.enabled !== false && (m.type === 'PM8000' || m.type === 'PM7400'))
    .forEach((m) => add(`${m.ip}:${m.port || 502}`).meters.push(m));
  return groups;
}

async function runGroup(key, g, s) {
  const pollMs = s.cycleMs || config.pollIntervalMs;
  await pollGroup(g.devs, pollMs);
  for (const m of g.meters) await pollMeter(m, pollMs);
}

async function pollMeter(m, pollMs) {
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
  // Frecuencia y reactiva opcionales: solo si el medidor tiene el registro configurado
  const frequency = r.freq != null ? await readF32(r.freq) : null;
  const reactive = r.reactive != null ? await readF32(r.reactive) : null;
  const online = voltage != null && current != null && power != null && pf != null;

  // Falla suelta: no publicar nada (el dashboard ve envejecer el último dato)
  const fails = online ? 0 : (meterFailCounters.get(m.name) || 0) + 1;
  meterFailCounters.set(m.name, fails);
  const prev = meterStates.get(m.name);
  const decision = commDecision(fails, !!(prev && prev.online));
  logComm(m.name, decision, fails);
  if (decision === 'hold') return;

  // Potencia activa por fase (L1/L2/L3). Registros configurables (regs.powerA/B/C);
  // si no están y el total es el 3060 del mapa PM8000, se usan 3054/3056/3058.
  // Si son consecutivos se leen en un solo pedido Modbus.
  let powerA = null, powerB = null, powerC = null;
  const phaseRegs = (r.powerA != null && r.powerB != null && r.powerC != null)
    ? [r.powerA, r.powerB, r.powerC]
    : (r.power === 3060 ? [3054, 3056, 3058] : null);
  if (online && phaseRegs) {
    if (phaseRegs[1] === phaseRegs[0] + 2 && phaseRegs[2] === phaseRegs[0] + 4) {
      const regs = await connections.poll(m.ip, m.port || 502, m.unitId || 1, phaseRegs[0] - 1, 6);
      if (regs) {
        const f = (i) => { const b = Buffer.alloc(4); b.writeUInt16BE(regs[i], 0); b.writeUInt16BE(regs[i + 1], 2); return b.readFloatBE(0); };
        powerA = f(0); powerB = f(2); powerC = f(4);
      }
    } else {
      powerA = await readF32(phaseRegs[0]); powerB = await readF32(phaseRegs[1]); powerC = await readF32(phaseRegs[2]);
    }
  }

  // Contador de energía activa del propio medidor (INT64 en Wh): entregada y
  // recibida. Configurable (regs.energyDel/energyRec); por defecto el mapa
  // PM8000 (total 3060) -> 3204 entregada / 3208 recibida, en un solo pedido.
  // Verificado en campo: 3204 sube igual que la potencia integrada.
  let energyDelKwh = null, energyRecKwh = null;
  const eDel = r.energyDel != null ? r.energyDel : (r.power === 3060 ? 3204 : null);
  const eRec = r.energyRec != null ? r.energyRec : (r.power === 3060 ? 3208 : null);
  if (online && eDel != null) {
    const both = eRec === eDel + 4;
    const regs = await connections.poll(m.ip, m.port || 502, m.unitId || 1, eDel - 1, both ? 8 : 4);
    if (regs) {
      const i64 = (i) => {
        let v = 0n;
        for (let k = 0; k < 4; k++) v = (v << 16n) | BigInt(regs[i + k] || 0);
        if (v >= (1n << 63n)) v -= (1n << 64n);
        const n = Number(v);
        // El medidor devuelve 0x8000… (mínimo INT64) cuando el dato no está disponible
        return Number.isFinite(n) && Math.abs(n) < 1e15 ? n / 1000 : null;
      };
      energyDelKwh = i64(0);
      if (both) energyRecKwh = i64(4);
    }
  }

  const data = {
    name: m.name, type: m.type, ip: m.ip,
    online, voltage: voltage || 0, current: current || 0, power: power || 0, pf: pf || 0,
    frequency: frequency || 0, reactive: reactive || 0,
    powerA, powerB, powerC,
    energyDelKwh, energyRecKwh,
    pollMs,   // cada cuánto se actualiza (para el "desactualizado" del dashboard)
    _ts: Date.now()
  };
  meterStates.set(m.name, data);
  const topic = `weg/meters/${sanitizeTopic(m.name)}`;
  mqttClient.publish(topic, JSON.stringify(data), { qos: 0, retain: true });
}

// Resuelve conexión y offsets de un device. Para SSW900 vía PLC, si el device
// referencia un slot del gateway (gateway + slot), toma los offsets de la tabla
// de slots del gateway (mapa de memoria del PLC = propiedad del gateway).
// Los offsets crudos del device (regOffset/statusOffset) ganan como override.
function resolveConn(dev) {
  let ip = dev.ip, port = dev.port || 502, unitId = dev.unitId;
  let regOffset = dev.regOffset, statusOffset = dev.statusOffset;
  if (dev.gateway != null) {
    const gw = (config.gateways || []).find((g) => g.name === dev.gateway);
    if (gw) {
      if (!ip) { ip = gw.ip; if (!dev.port) port = gw.port || port; }
      if (dev.slot != null && Array.isArray(gw.slots)) {
        const s = gw.slots.find((x) => x.id === dev.slot);
        if (s) {
          if (regOffset == null) regOffset = s.regOffset;
          if (statusOffset == null) statusOffset = s.statusOffset;
        }
      }
    }
  }
  return { ip, port, unitId, regOffset: regOffset || 0, statusOffset };
}

async function pollGroup(devices, pollMs) {
  for (const dev of devices) {
    // Caído confirmado: se reintenta cada 30 s, no en cada vuelta (queda
    // publicado OFFLINE; los que andan no esperan su timeout)
    if (offlineRetry.skip(dev.name)) { lastPollAt.set(dev.name, Date.now()); continue; }
    const conn = resolveConn(dev);
    const count = 70;
    const regs = await connections.poll(conn.ip, conn.port, conn.unitId, conn.regOffset, count);

    // For SSW900 via PLC gateway, also read the status block
    let statusRegs = null;
    if (regs && dev.type === 'SSW900' && conn.statusOffset != null) {
      statusRegs = await connections.poll(conn.ip, conn.port, conn.unitId, conn.statusOffset, 12);
    }

    // For CFW900, also read IGBT temperature parameters P2020/P2021/P2022
    let igbtRegs = null;
    if (regs && dev.type === 'CFW900') {
      igbtRegs = await connections.poll(conn.ip, conn.port, conn.unitId, 2020, 3);
    }

    // Lecturas fallidas seguidas (se resetea al recuperarse la comunicación).
    // Una falla suelta no lo da por caído: no se publica nada hasta confirmar.
    const fails = regs ? 0 : (commErrorCounters.get(dev.name) || 0) + 1;
    commErrorCounters.set(dev.name, fails);
    const prev = deviceStates.get(dev.name);
    const decision = commDecision(fails, !!(prev && prev.online));
    logComm(dev.name, decision, fails);
    if (decision === 'hold') continue;
    if (decision === 'offline') offlineRetry.offline(dev.name); else offlineRetry.online(dev.name);

    let data;
    if (regs) {
      data = parse(regs, dev, statusRegs, igbtRegs);
    } else {
      // Offline: sin estado en vivo (falla/alarma/marcha no se congelan)
      data = offlineState(dev, prev);
    }

    data.index = dev.index;
    data.commErrors = fails;
    data.pollMs = pollMs;   // cada cuánto se actualiza (para el "desactualizado" del dashboard)

    // Alarmas por setpoint (corriente/temp/comm vs umbrales). Después de commErrors.
    evaluateAlarms(data, dev);

    // Horas de marcha: el tiempo REAL desde la lectura anterior (antes se
    // sumaba el intervalo nominal de 2 s aunque la vuelta tardara más, y las
    // bombas de un gateway lento quedaban con menos horas). Tope de 60 s
    // para no contar como marcha un corte largo.
    const nowMs = Date.now();
    const last = lastPollAt.get(dev.name);
    lastPollAt.set(dev.name, nowMs);
    if (!runAccumulators.has(dev.name)) runAccumulators.set(dev.name, 0);
    if (data.running && last) {
      runAccumulators.set(dev.name, runAccumulators.get(dev.name) + Math.min(nowMs - last, 60000) / 1000);
    }
    data.runHours = runAccumulators.get(dev.name) / 3600;

    deviceStates.set(dev.name, data);

    // Publish to MQTT
    const topic = `${config.mqtt.topicPrefix}/${sanitizeTopic(dev.name)}`;
    mqttClient.publish(topic, JSON.stringify(data), { qos: 0, retain: true });
  }
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
    if ((commErrorCounters.get(d.name) || 0) > 0) continue; // en espera por falla suelta: no repetir el último valor

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
      `dc_link=${d.dcLink || 0}`,
      `torque=${d.torque || 0}`,
      `motor_temp=${d.motorTemp || 0}`,
      `igbt_temp=${d.igbtTemp || 0}`,
      `scr_temp=${d.scrTemp || 0}`,
      `running=${d.running ? 'true' : 'false'}`,
      `state_code=${d.stateCode || 0}i`,
      `run_hours=${d.runHours || 0}`,
      `comm_errors=${d.commErrors || 0}i`
    ];
    // Totalizadores internos del equipo (horímetro): horas habilitado/marcha y
    // horas energizado. Solo si el equipo los reporta (el SSW sin dato da '-').
    const hEnabled = parseFloat(d.hoursEnabled);
    const hEnergized = parseFloat(d.hoursEnergized);
    if (Number.isFinite(hEnabled) && hEnabled > 0) fields.push(`hours_enabled=${hEnabled}`);
    if (Number.isFinite(hEnergized) && hEnergized > 0) fields.push(`hours_energized=${hEnergized}`);

    lines.push(`drive_data,name=${name},ip=${ip},index=${d.index || 0},site=${site},type=${d.type || 'CFW900'} ${fields.join(',')} ${ts}`);
  }

  // PM8000 / meters
  for (const [, m] of meterStates) {
    if (!m.online) continue;
    if ((meterFailCounters.get(m.name) || 0) > 0) continue; // ídem
    const name = (m.name || 'meter').replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
    const ip = (m.ip || '0.0.0.0').replace(/ /g, '\\ ');
    const fields = [
      `voltage=${m.voltage || 0}`,
      `current=${m.current || 0}`,
      `power=${m.power || 0}`,
      `pf=${m.pf || 0}`,
      `reactive=${m.reactive || 0}`
    ];
    // Potencia por fase (W, como el total) — solo si se leyó
    if (Number.isFinite(m.powerA)) fields.push(`power_a=${m.powerA}`);
    if (Number.isFinite(m.powerB)) fields.push(`power_b=${m.powerB}`);
    if (Number.isFinite(m.powerC)) fields.push(`power_c=${m.powerC}`);
    // Contador de energía del medidor (kWh) — para kWh inicial/final del día
    if (Number.isFinite(m.energyDelKwh)) fields.push(`energy_del=${m.energyDelKwh}`);
    if (Number.isFinite(m.energyRecKwh)) fields.push(`energy_rec=${m.energyRecKwh}`);
    lines.push(`meter_data,name=${name},ip=${ip},type=${m.type || 'PM8000'} ${fields.join(',')} ${ts}`);
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
    const oldConfig = config;
    config = loadConfig(config);
    const newNames = new Set(config.devices.map(d => d.name));

    // Clear MQTT retained messages for deleted devices and deleted/disabled meters
    for (const topic of topicsToClear(oldConfig, config)) {
      mqttClient.publish(topic, '', { qos: 0, retain: true });
      console.log(`[CFG] ${topic} removed — cleared MQTT retained`);
    }
    for (const d of oldConfig.devices) {
      if (!newNames.has(d.name)) { deviceStates.delete(d.name); disabledCleared.delete(d.name); }
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
  // Lectura por conexión: cada gateway/equipo/medidor a su propio ritmo
  // (scheduler.js). Las vueltas lentas se informan cada 10 min como mucho.
  const slowLogged = new Map();
  const scheduler = createScheduler({
    intervalMs: () => config.pollIntervalMs,
    getGroups,
    runGroup,
    onCycle: (k, dt, s) => {
      if (dt <= 3 * config.pollIntervalMs) return;
      if (Date.now() - (slowLogged.get(k) || 0) < 600000) return;
      slowLogged.set(k, Date.now());
      console.warn(`[POLL] ${k}: vuelta de ${dt} ms (promedio ${s.cycleMs} ms) — no frena a las demás conexiones`);
    },
  });
  setTimeout(() => setInterval(scheduler.tick, 250), 1000);

  // Resumen de estado + archivo de salud (el loop está vivo)
  setInterval(() => { publishStatus(); writeHealthFile(); }, config.pollIntervalMs);

  // Start InfluxDB write loop
  setInterval(writeInflux, config.influxWriteIntervalMs);

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
