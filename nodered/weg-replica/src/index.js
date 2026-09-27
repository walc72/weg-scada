'use strict';

const http = require('http');
const path = require('path');
const mqtt = require('mqtt');
const { createSource } = require('./source');
const { createInfluxWriter } = require('./influx');
const { createCursorStore } = require('./cursor');
const { createHistorySync } = require('./history');
const { createFileSync } = require('./files');
const { createLiveBridge } = require('./live');

const env = (k, d) => process.env[k] || d;
const SOURCE = (env('REPLICA_SOURCE', '')).replace(/\/$/, '');
const TOKEN = env('REPLICA_TOKEN', '');
if (!SOURCE || !TOKEN) {
  console.error('[REPLICA] Faltan REPLICA_SOURCE / REPLICA_TOKEN');
  process.exit(1);
}
const CONFIG_PATH = env('CONFIG_PATH', '/app/config/config.json');
const MANUAL_PATH = path.join(path.dirname(CONFIG_PATH), 'manual.json');
const DATA_DIR = env('DATA_DIR', '/data');
const FILES_EVERY_MS = 5 * 60000;
const STATUS_EVERY_MS = 10000;

const status = { lastSync: null, cursor: null, live: false, error: null };
const setStatus = (patch) => Object.assign(status, patch);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function statusPayload() {
  const lagSec = status.cursor ? Math.round((Date.now() - Date.parse(status.cursor)) / 1000) : null;
  return { lastSync: status.lastSync, lagSec, live: status.live, error: status.error };
}

// ─── Histórico ───────────────────────────────────────────────────────
const source = createSource({ baseUrl: SOURCE, token: TOKEN });
const write = createInfluxWriter({
  url: env('INFLUXDB_URL', 'http://influxdb:8086'),
  org: env('INFLUXDB_ORG', 'tecnoelectric'),
  bucket: env('INFLUXDB_BUCKET', 'weg_drives'),
  token: env('INFLUXDB_TOKEN', ''),
});
const history = createHistorySync({
  source, write, sleep, onStatus: setStatus,
  cursor: createCursorStore(path.join(DATA_DIR, 'cursor.json')),
});

// ─── Config y datos manuales ─────────────────────────────────────────
const syncFiles = createFileSync({ source, configPath: CONFIG_PATH, manualPath: MANUAL_PATH });
async function filesLoop() {
  for (;;) {
    try { await syncFiles(); } catch (e) { console.error(`[FILES] ${e.message}`); }
    await sleep(FILES_EVERY_MS);
  }
}

// ─── En vivo ─────────────────────────────────────────────────────────
const local = mqtt.connect(env('MQTT_BROKER', 'mqtt://mosquitto:1883'), { clientId: 'weg-replica-local', reconnectPeriod: 5000 });
const remote = mqtt.connect(SOURCE.replace(/^http/, 'ws') + '/mqtt', {
  clientId: 'weg-replica-' + Math.random().toString(16).slice(2, 10),
  reconnectPeriod: 5000,
  connectTimeout: 10000,
});
createLiveBridge({ remote, local, onStatus: setStatus });

setInterval(() => {
  if (local.connected) local.publish('weg/replica/status', JSON.stringify(statusPayload()), { qos: 0, retain: true });
}, STATUS_EVERY_MS);

// ─── Health ──────────────────────────────────────────────────────────
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusPayload()));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3300, '0.0.0.0');

console.log(`[REPLICA] Origen ${SOURCE} → Influx/MQTT locales`);
history.run();
filesLoop();
