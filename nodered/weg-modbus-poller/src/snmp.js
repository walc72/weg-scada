'use strict';

// Lectura SNMP de los enlaces de comunicaciones (radios Ubiquiti airMAX y
// routers Teltonika RUT) y estado en línea/caído de cada uno.

const snmp = require('net-snmp');
const { commDecision } = require('./scheduler');

const UPTIME = { key: 'uptime', oid: '1.3.6.1.2.1.1.3.0', scale: 0.01 }; // centésimas → s

// OID iniciales: se verifican contra el equipo real en la puesta en marcha.
const OIDS = {
  // UBNT-AirMAX-MIB, radio índice 1 (bps → Mbps; LiteBeam 5AC airOS 8 da 27000000 = 27 Mbps)
  airmax: [
    { key: 'signal', oid: '1.3.6.1.4.1.41112.1.4.5.1.5.1' },
    { key: 'noise', oid: '1.3.6.1.4.1.41112.1.4.5.1.8.1' },
    { key: 'quality', oid: '1.3.6.1.4.1.41112.1.4.5.1.7.1' }, // CCQ
    { key: 'txMbps', oid: '1.3.6.1.4.1.41112.1.4.5.1.9.1', scale: 1e-6 },
    { key: 'rxMbps', oid: '1.3.6.1.4.1.41112.1.4.5.1.10.1', scale: 1e-6 },
    { key: 'remoto', oid: '1.3.6.1.4.1.41112.1.4.5.1.2.1', text: true }, // SSID
    { key: 'freqMhz', oid: '1.3.6.1.4.1.41112.1.4.1.1.4.1' },
    { key: 'anchoMhz', oid: '1.3.6.1.4.1.41112.1.4.5.1.14.1' },
    UPTIME,
  ],
  // TELTONIKA-MIB, módem 1
  rut: [
    { key: 'signal', oid: '1.3.6.1.4.1.48690.2.2.1.12.1' },
    { key: 'operador', oid: '1.3.6.1.4.1.48690.2.2.1.13.1', text: true },
    { key: 'red', oid: '1.3.6.1.4.1.48690.2.2.1.16.1', text: true },
    UPTIME,
  ],
};

// airOS 8 (LiteBeam/NanoStation AC) solo contesta SNMP v1: en v2c no responde nada.
const VERSION = { airmax: snmp.Version1, rut: snmp.Version2c };

// Tabla de estaciones (ubntStaTable, índice = MAC del remoto): se lee la primera
// fila con getNext sobre cada columna. Alcanza para enlaces punto a punto.
// ponytail: un AP con varios clientes muestra solo el primero; listar todos si hace falta.
const STA = '1.3.6.1.4.1.41112.1.4.7.1.';
const STA_FIELDS = [
  { key: 'remotoNombre', oid: STA + '2', text: true },
  { key: 'remotoSignal', oid: STA + '3' },
  { key: 'remotoNoise', oid: STA + '4' },
  { key: 'distanciaM', oid: STA + '5' },
  { key: 'remotoIp', oid: STA + '10', text: true },
  { key: 'txBytes', oid: STA + '13', bytes: true },
  { key: 'rxBytes', oid: STA + '14', bytes: true },
  { key: 'capTxMbps', oid: STA + '17', scale: 0.001 }, // kbps → Mbps
  { key: 'capRxMbps', oid: STA + '18', scale: 0.001 },
];

const KEYS = ['signal', 'noise', 'quality', 'txMbps', 'rxMbps', 'remoto', 'operador', 'red', 'uptime',
  'freqMhz', 'anchoMhz', ...STA_FIELDS.map(f => f.key), 'trafTxMbps', 'trafRxMbps'];
const empty = () => Object.fromEntries(KEYS.map(k => [k, null]));

function setField(out, f, v) {
  if (!v || snmp.isVarbindError(v)) return;
  if (f.text) out[f.key] = Buffer.isBuffer(v.value) ? v.value.toString() : String(v.value);
  // Counter64: en v1 llega como bytes big-endian
  else if (f.bytes && Buffer.isBuffer(v.value)) out[f.key] = v.value.reduce((a, b) => a * 256 + b, 0);
  else if (typeof v.value === 'number') out[f.key] = f.scale ? Math.round(v.value * f.scale * 1000) / 1000 : v.value;
}

// varbinds de la respuesta → lectura con todos los campos (ausente/error → null)
function mapVarbinds(tipo, varbinds) {
  const out = empty();
  const byOid = new Map((varbinds || []).map(v => [v.oid, v]));
  for (const f of OIDS[tipo] || []) setField(out, f, byOid.get(f.oid));
  return out;
}

// getNext de cada columna → primera fila; si salta fuera de la columna, no hay remoto
function mapStation(out, varbinds) {
  STA_FIELDS.forEach((f, i) => {
    const v = varbinds[i];
    if (v && v.oid && v.oid.startsWith(f.oid + '.')) setField(out, f, v);
  });
}

// null = sin respuesta (timeout o error de request)
function readComm(comm, { timeoutMs = 3000, port = 161 } = {}) {
  const fields = OIDS[comm.tipo];
  if (!fields) return Promise.resolve(null);
  const session = snmp.createSession(comm.ip, comm.community, {
    port, timeout: timeoutMs, retries: 0, version: VERSION[comm.tipo],
  });
  session.on('error', () => {}); // errores de socket llegan por el callback de get
  const call = (method, oids) => new Promise((resolve) => session[method](oids, (err, vb) => resolve(err ? { err } : { vb })));
  // null = sin respuesta. En v1 un OID inexistente hace fallar todo el pedido
  // (noSuchName), aunque el equipo contestó: se reintenta de a uno.
  const fetch = async (method, oids) => {
    const r = await call(method, oids);
    if (!r.err) return r.vb;
    if (!(r.err instanceof snmp.RequestFailedError)) return null;
    const each = await Promise.all(oids.map(o => call(method, [o])));
    return each.map(e => (e.vb ? e.vb[0] : null));
  };
  return (async () => {
    try {
      const vb = await fetch('get', fields.map(f => f.oid));
      if (!vb) return null;
      const out = mapVarbinds(comm.tipo, vb.filter(Boolean));
      if (comm.tipo === 'airmax') mapStation(out, (await fetch('getNext', STA_FIELDS.map(f => f.oid))) || []);
      return out;
    } finally {
      session.close();
    }
  })();
}

// Estado por enlace. update() → { state, changed, publish }:
//   state   payload del tópico ({ online, desde, ...lectura })
//   changed true solo si `online` cambió (o es la primera vez)
//   publish true salvo 'hold' (falla suelta): refresca los valores en cada vuelta
function createCommTracker({ now = Date.now } = {}) {
  const items = new Map(); // name → { fails, state, t }
  return {
    update(comm, reading) {
      const prev = items.get(comm.name);
      const fails = reading ? 0 : (prev ? prev.fails : 0) + 1;
      const decision = commDecision(fails, !!(prev && prev.state.online));
      if (decision === 'hold') {
        items.set(comm.name, { ...prev, fails });
        return { state: prev.state, changed: false, publish: false };
      }
      const online = decision === 'online';
      const changed = !prev || prev.state.online !== online;
      const t = now();
      const state = {
        online,
        desde: changed ? t : prev.state.desde,
        ...(online ? reading : empty()),
      };
      // Tráfico = delta de contadores de bytes entre lecturas (contador reiniciado → null)
      if (online && prev && prev.state.online) {
        const dt = (t - prev.t) / 1000;
        for (const [k, b] of [['trafTxMbps', 'txBytes'], ['trafRxMbps', 'rxBytes']]) {
          const d = state[b] - prev.state[b];
          if (state[b] != null && prev.state[b] != null && dt > 0 && d >= 0) state[k] = Math.round(d * 8 / dt / 1e4) / 100;
        }
      }
      items.set(comm.name, { fails, state, t });
      return { state, changed, publish: true };
    },
    forget: (name) => items.delete(name),
    get: (name) => items.get(name)?.state,
  };
}

module.exports = { OIDS, mapVarbinds, readComm, createCommTracker };
