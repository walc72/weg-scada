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
const { loadConnection } = require('./connection');
const { createManager } = require('./manager');

const env = (k, d) => process.env[k] || d;
const CONFIG_PATH = env('CONFIG_PATH', '/app/config/config.json');
const CONFIG_DIR = path.dirname(CONFIG_PATH);
const LINK_FILE = path.join(CONFIG_DIR, 'replica.json');
const MANUAL_PATH = path.join(CONFIG_DIR, 'manual.json');
const DATA_DIR = env('DATA_DIR', '/data');
const FILES_EVERY_MS = 5 * 60000;
const STATUS_EVERY_MS = 10000;
const RELOAD_EVERY_MS = 10000;

const status = { configured: false, source: null, lastSync: null, cursor: null, live: false, error: null };
const setStatus = (patch) => Object.assign(status, patch);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function statusPayload() {
  const lagSec = status.cursor ? Math.round((Date.now() - Date.parse(status.cursor)) / 1000) : null;
  return { configured: status.configured, source: status.source, lastSync: status.lastSync, lagSec, live: status.live, error: status.error };
}

const write = createInfluxWriter({
  url: env('INFLUXDB_URL', 'http://influxdb:8086'),
  org: env('INFLUXDB_ORG', 'tecnoelectric'),
  bucket: env('INFLUXDB_BUCKET', 'weg_drives'),
  token: env('INFLUXDB_TOKEN', ''),
});
const local = mqtt.connect(env('MQTT_BROKER', 'mqtt://mosquitto:1883'), { clientId: 'weg-replica-local', reconnectPeriod: 5000 });

// Runtime de una conexión: histórico + archivos + en vivo. stop() lo corta.
function start(conn) {
  let stopped = false;
  setStatus({ configured: true, source: conn.source, lastSync: null, cursor: null, live: false, error: null });
  const source = createSource({ baseUrl: conn.source, token: conn.token });
  const history = createHistorySync({
    source, write, sleep, onStatus: (p) => { if (!stopped) setStatus(p); },
    cursor: createCursorStore(path.join(DATA_DIR, 'cursor.json'), conn.source),
  });
  history.run();

  const syncFiles = createFileSync({ source, configPath: CONFIG_PATH, manualPath: MANUAL_PATH });
  (async () => {
    while (!stopped) {
      try { await syncFiles(); } catch (e) { console.error(`[FILES] ${e.message}`); }
      await sleep(FILES_EVERY_MS);
    }
  })();

  const remote = mqtt.connect(conn.source.replace(/^http/, 'ws') + '/mqtt', {
    clientId: 'weg-replica-' + Math.random().toString(16).slice(2, 10),
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    // /mqtt de planta exige el token de la réplica (header, no URL)
    wsOptions: { headers: { Authorization: `Bearer ${conn.token}` } },
  });
  createLiveBridge({ remote, local, onStatus: (p) => { if (!stopped) setStatus(p); } });

  return {
    stop() {
      stopped = true;
      history.stop();
      remote.end(true);
      setStatus({ configured: false, source: null, live: false });
    },
  };
}

const manager = createManager({ load: () => loadConnection({ file: LINK_FILE, env: process.env }), start });
manager.tick();
if (!manager.connection()) console.log('[REPLICA] Sin configurar: esperando el código de enlace desde Configuración');
setInterval(() => { try { manager.tick(); } catch (e) { console.error(`[REPLICA] ${e.message}`); } }, RELOAD_EVERY_MS);

setInterval(() => {
  if (local.connected) local.publish('weg/replica/status', JSON.stringify(statusPayload()), { qos: 0, retain: true });
}, STATUS_EVERY_MS);

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusPayload()));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3300, '0.0.0.0');

console.log('[REPLICA] Iniciado');
