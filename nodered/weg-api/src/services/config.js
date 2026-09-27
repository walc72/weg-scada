'use strict';

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const mqtt = require('mqtt');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
let config = null;
let deviceStates = new Map();
let mqttClient = null;

// Réplica recién instalada: todavía no bajó config.json de planta (se enlaza
// desde la UI). Esqueleto vacío en memoria (no se guarda) para que la API y la
// pantalla de Conexión funcionen. En planta NO: ahí un config faltante es un error.
function replicaSkeleton() {
  return {
    pollIntervalMs: 2000, influxWriteIntervalMs: 10000,
    mqtt: { broker: 'mqtt://weg-mosquitto:1883', topicPrefix: 'weg/drives', statusTopic: 'weg/status' },
    influxdb: { url: 'http://weg-influxdb:8086', org: process.env.INFLUXDB_ORG || 'tecnoelectric', bucket: process.env.INFLUXDB_BUCKET || 'weg_drives', token: '' },
    alarmSetpoints: {}, gateways: [], devices: [], meters: [], gaugeZones: {},
  };
}
const isReplica = () => ['1', 'true', 'yes'].includes(String(process.env.REPLICA_MODE || '').toLowerCase());

// ─── Config Read/Write ──────────────────────────────────────────────
function load() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log(`[CFG] Loaded: ${config.devices.length} devices`);
    return config;
  } catch (e) {
    if (e.code === 'ENOENT' && isReplica()) {
      config = replicaSkeleton();
      console.log('[CFG] Réplica sin config.json todavía: esqueleto vacío hasta enlazar con planta');
      return config;
    }
    console.error(`[CFG] Load failed: ${e.message}`);
    return null;
  }
}

function save(newConfig) {
  try {
    const tmp = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(newConfig, null, 2));
    fs.renameSync(tmp, CONFIG_PATH);
    config = newConfig;
    console.log('[CFG] Saved');
    return true;
  } catch (e) {
    console.error(`[CFG] Save failed: ${e.message}`);
    return false;
  }
}

function get() {
  if (!config) load();
  return config;
}

// ─── MQTT subscription for live device status ───────────────────────
function connectMQTT() {
  const cfg = get();
  const broker = process.env.MQTT_BROKER || (cfg && cfg.mqtt ? cfg.mqtt.broker : 'mqtt://weg-mosquitto:1883');
  const prefix = cfg && cfg.mqtt ? cfg.mqtt.topicPrefix : 'weg/drives';

  console.log(`[MQTT] Connecting to ${broker}`);
  mqttClient = mqtt.connect(broker, { clientId: 'weg-api', reconnectPeriod: 5000, connectTimeout: 4000 });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected');
    mqttClient.subscribe(`${prefix}/+`);
    mqttClient.subscribe((cfg && cfg.mqtt && cfg.mqtt.statusTopic) || 'weg/status');
  });

  mqttClient.on('message', (topic, payload) => {
    try {
      const data = JSON.parse(payload.toString());
      if (data.name) {
        deviceStates.set(data.name, data);
      }
    } catch (e) {}
  });

  mqttClient.on('error', (err) => console.error('[MQTT] Error:', err.message));
}

function getLiveStatus() {
  const devices = [];
  for (const [, d] of deviceStates) {
    devices.push(d);
  }
  return {
    total: devices.length,
    online: devices.filter(d => d.online).length,
    running: devices.filter(d => d.running).length,
    faults: devices.filter(d => d.hasFault).length,
    devices,
    ts: Date.now()
  };
}

function getDeviceState(name) {
  return deviceStates.get(name) || null;
}

// ─── Watch config for external changes ──────────────────────────────
// 'add' además de 'change': en una réplica recién enlazada config.json no
// existía al arrancar y aparece después (tmp + rename) → chokidar emite 'add'.
function watchConfigFile({ interval = 3000 } = {}) {
  const reload = (what) => { console.log(`[CFG] File ${what}, reloading...`); load(); };
  return chokidar.watch(CONFIG_PATH, { ignoreInitial: true, usePolling: true, interval })
    .on('add', () => reload('added'))
    .on('change', () => reload('changed'))
    .on('error', (err) => console.error('[CFG] Watch error:', err.message));
}

function watchConfig() {
  load();
  connectMQTT();
  watchConfigFile();
}

module.exports = { get, load, save, watchConfig, watchConfigFile, getLiveStatus, getDeviceState, deviceStates };
