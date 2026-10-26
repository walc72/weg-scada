'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const snmp = require('net-snmp');
const { OIDS, mapVarbinds, readComm, createCommTracker } = require('../src/snmp');

const AIRMAX = {
  signal: -62, noise: -95, quality: 98, txMbps: 300000, rxMbps: 270000,
  remoto: 'PTP-Pozo3', uptime: 360000,
};

// Agente SNMP real en loopback. Los OID de la tabla terminan en ".1" (no en
// ".0"), así que se cuelgan nodos sueltos bajo un escalar raíz que les da acceso.
const agents = [];
function startAgent(port, omit = []) {
  const agent = snmp.createAgent({ port, address: '127.0.0.1', disableAuthorization: true }, () => {});
  agents.push(agent);
  const mib = agent.getMib();
  for (const [name, oid] of [['raiz', '1.3.6.1.4.1.41112'], ['sys', '1.3.6.1.2.1.1']]) {
    mib.registerProvider({
      name, type: snmp.MibProviderType.Scalar, oid,
      scalarType: snmp.ObjectType.Integer32, maxAccess: snmp.MaxAccess['read-only'],
    });
    mib.setScalarValue(name, 0);
  }
  for (const f of OIDS.airmax) {
    if (omit.includes(f.key)) continue;
    const addr = f.oid.split('.').map(Number);
    mib.addNodesForAddress(addr);
    const n = mib.lookup(addr);
    n.valueType = f.text ? snmp.ObjectType.OctetString : f.key === 'uptime' ? snmp.ObjectType.TimeTicks : snmp.ObjectType.Integer32;
    n.value = f.text ? Buffer.from(AIRMAX[f.key]) : AIRMAX[f.key];
  }
  return port;
}
const freePort = () => 16100 + Math.floor(Math.random() * 3000);
test.after(() => agents.forEach(a => a.close()));

const comm = (port) => ({ name: 'enlace1', tipo: 'airmax', ip: '127.0.0.1', community: 'public', port });

test('readComm lee un airMAX y aplica las escalas', async () => {
  const port = startAgent(freePort());
  const r = await readComm(comm(port), { port, timeoutMs: 1500 });
  assert.deepEqual(r, {
    signal: -62, noise: -95, quality: 98, txMbps: 300, rxMbps: 270,
    remoto: 'PTP-Pozo3', operador: null, red: null, uptime: 3600,
  });
});

test('readComm: un OID inexistente deja ese campo en null', async () => {
  const port = startAgent(freePort(), ['quality']);
  const r = await readComm(comm(port), { port, timeoutMs: 1500 });
  assert.ok(r);
  assert.equal(r.quality, null);
  assert.equal(r.signal, -62);
});

test('readComm sin agente resuelve null a tiempo', async () => {
  const t0 = Date.now();
  const r = await readComm(comm(1), { port: freePort(), timeoutMs: 800 });
  assert.equal(r, null);
  assert.ok(Date.now() - t0 < 3500);
});

test('mapVarbinds rut llena señal/operador/red y deja el resto en null', () => {
  const vb = OIDS.rut.map(f => ({
    oid: f.oid,
    type: f.text ? snmp.ObjectType.OctetString : snmp.ObjectType.Integer32,
    value: f.key === 'signal' ? -70 : f.text ? Buffer.from(f.key === 'operador' ? 'Claro' : 'LTE') : 100,
  }));
  const r = mapVarbinds('rut', vb);
  assert.equal(r.signal, -70);
  assert.equal(r.operador, 'Claro');
  assert.equal(r.red, 'LTE');
  assert.equal(r.quality, null);
  assert.equal(r.txMbps, null);
});

test('tracker: caído recién tras 3 fallas, y vuelve con una lectura buena', () => {
  let t = 1000;
  const tr = createCommTracker({ now: () => t });
  const c = { name: 'e1' };
  const ok = { signal: -60 };
  let r = tr.update(c, ok);
  assert.equal(r.state.online, true);
  assert.equal(r.changed, true);
  assert.equal(r.state.desde, 1000);
  t = 2000; r = tr.update(c, null);
  assert.equal(r.changed, false); assert.equal(r.publish, false); assert.equal(r.state.online, true);
  t = 3000; r = tr.update(c, null);
  assert.equal(r.changed, false);
  t = 4000; r = tr.update(c, null);
  assert.equal(r.state.online, false);
  assert.equal(r.changed, true);
  assert.equal(r.state.desde, 4000);
  // ya caído: se sigue publicando pero sin cambio
  t = 5000; r = tr.update(c, null);
  assert.equal(r.publish, true); assert.equal(r.changed, false); assert.equal(r.state.desde, 4000);
  t = 6000; r = tr.update(c, ok);
  assert.equal(r.state.online, true);
  assert.equal(r.changed, true);
  assert.equal(r.state.desde, 6000);
});

test('tracker: dos lecturas buenas seguidas publican ambas, solo la 1.ª cambia', () => {
  const tr = createCommTracker({ now: () => 1 });
  const c = { name: 'e2' };
  const a = tr.update(c, { signal: -60 });
  const b = tr.update(c, { signal: -55 });
  assert.equal(a.publish, true);
  assert.equal(b.publish, true);
  assert.equal(b.changed, false);
  assert.equal(b.state.signal, -55);
  assert.equal(tr.get('e2').signal, -55);
  tr.forget('e2');
  assert.equal(tr.get('e2'), undefined);
});
