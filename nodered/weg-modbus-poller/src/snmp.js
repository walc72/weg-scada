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
  const session = snmp.createSession(comm.ip, comm.community, {
    port, timeout: timeoutMs, retries: 0, version: VERSION[comm.tipo],
  });
  session.on('error', () => {}); // errores de socket llegan por el callback de get
  const get = (oids) => new Promise((resolve) => session.get(oids, (err, vb) => resolve(err ? { err } : { vb })));
  return (async () => {
    try {
      const r = await get(fields.map(f => f.oid));
      if (!r.err) return mapVarbinds(comm.tipo, r.vb);
      // En v1 un OID inexistente hace fallar todo el pedido (noSuchName), aunque el
      // equipo contestó: se reintenta de a uno y quedan en null los que no existen.
      if (!(r.err instanceof snmp.RequestFailedError)) return null;
      const each = await Promise.all(fields.map(f => get([f.oid])));
      return mapVarbinds(comm.tipo, each.flatMap(e => e.vb || []));
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
