'use strict';

// Lectura SNMP de los enlaces de comunicaciones (radios Ubiquiti airMAX y
// routers Teltonika RUT) y estado en línea/caído de cada uno.

const snmp = require('net-snmp');
const { commDecision } = require('./scheduler');

const UPTIME = { key: 'uptime', oid: '1.3.6.1.2.1.1.3.0', scale: 0.01 }; // centésimas → s

// OID iniciales: se verifican contra el equipo real en la puesta en marcha.
const OIDS = {
  // UBNT-AirMAX-MIB, radio índice 1 (kbps → Mbps)
  airmax: [
    { key: 'signal', oid: '1.3.6.1.4.1.41112.1.4.5.1.5.1' },
    { key: 'noise', oid: '1.3.6.1.4.1.41112.1.4.5.1.8.1' },
    { key: 'quality', oid: '1.3.6.1.4.1.41112.1.4.5.1.7.1' }, // CCQ
    { key: 'txMbps', oid: '1.3.6.1.4.1.41112.1.4.5.1.9.1', scale: 0.001 },
    { key: 'rxMbps', oid: '1.3.6.1.4.1.41112.1.4.5.1.10.1', scale: 0.001 },
    { key: 'remoto', oid: '1.3.6.1.4.1.41112.1.4.5.1.2.1', text: true }, // SSID
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

const KEYS = ['signal', 'noise', 'quality', 'txMbps', 'rxMbps', 'remoto', 'operador', 'red', 'uptime'];
const empty = () => Object.fromEntries(KEYS.map(k => [k, null]));

// varbinds de la respuesta → lectura con todos los campos (ausente/error → null)
function mapVarbinds(tipo, varbinds) {
  const out = empty();
  const byOid = new Map((varbinds || []).map(v => [v.oid, v]));
  for (const f of OIDS[tipo] || []) {
    const v = byOid.get(f.oid);
    if (!v || snmp.isVarbindError(v)) continue;
    if (f.text) out[f.key] = Buffer.isBuffer(v.value) ? v.value.toString() : String(v.value);
    else if (typeof v.value === 'number') out[f.key] = f.scale ? Math.round(v.value * f.scale * 1000) / 1000 : v.value;
  }
  return out;
}

// null = sin respuesta (timeout o error de request)
function readComm(comm, { timeoutMs = 3000, port = 161 } = {}) {
  const fields = OIDS[comm.tipo];
  if (!fields) return Promise.resolve(null);
  return new Promise((resolve) => {
    const session = snmp.createSession(comm.ip, comm.community, {
      port, timeout: timeoutMs, retries: 0, version: snmp.Version2c,
    });
    session.on('error', () => {}); // errores de socket llegan por el callback de get
    session.get(fields.map(f => f.oid), (err, varbinds) => {
      session.close();
      resolve(err ? null : mapVarbinds(comm.tipo, varbinds));
    });
  });
}

// Estado por enlace. update() → { state, changed, publish }:
//   state   payload del tópico ({ online, desde, ...lectura })
//   changed true solo si `online` cambió (o es la primera vez)
//   publish true salvo 'hold' (falla suelta): refresca los valores en cada vuelta
function createCommTracker({ now = Date.now } = {}) {
  const items = new Map(); // name → { fails, state }
  return {
    update(comm, reading) {
      const prev = items.get(comm.name);
      const fails = reading ? 0 : (prev ? prev.fails : 0) + 1;
      const decision = commDecision(fails, !!(prev && prev.state.online));
      if (decision === 'hold') {
        items.set(comm.name, { fails, state: prev.state });
        return { state: prev.state, changed: false, publish: false };
      }
      const online = decision === 'online';
      const changed = !prev || prev.state.online !== online;
      const state = {
        online,
        desde: changed ? now() : prev.state.desde,
        ...(online ? reading : empty()),
      };
      items.set(comm.name, { fails, state });
      return { state, changed, publish: true };
    },
    forget: (name) => items.delete(name),
    get: (name) => items.get(name)?.state,
  };
}

module.exports = { OIDS, mapVarbinds, readComm, createCommTracker };
