'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const L = require('../src/services/license');
const { verify, sign, readInstallId, ensureInstallId, tier, usage, allowed, check, load } = L;

const keys = () => crypto.generateKeyPairSync('ed25519');
const { publicKey, privateKey: priv } = keys();
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const ID = '7f3c2a9e-1b4d-4c6e-9f0a-2b3c4d5e6f70';
const P = { v: 1, installId: ID, cliente: 'Agriplus', emitida: '2026-10-22', modulos: ['medidores'], limites: { A: 0, B: 20, C: 1 } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));

test('licencia válida', () => {
  const r = verify(sign(P, priv), ID, { publicKey: pub });
  assert.equal(r.ok, true); assert.equal(r.cliente, 'Agriplus');
  assert.deepEqual(r.modulos, ['medidores']); assert.deepEqual(r.limites, { A: 0, B: 20, C: 1 });
});
test('tolera \r\n y espacios', () => assert.equal(verify('  ' + sign(P, priv) + '\r\n', ID, { publicKey: pub }).ok, true));
test('byte cambiado → firma', () => {
  const d = L.decode(sign(P, priv));
  const bad = L.encode({ ...P, cliente: 'Agriplux' }, d.sig);
  assert.equal(verify(bad, ID, { publicKey: pub }).motivo, 'firma');
});
test('otra instalación', () => assert.equal(verify(sign(P, priv), 'otro-id', { publicKey: pub }).motivo, 'otra-instalacion'));
test('checkInstall false acepta otro ID', () => assert.equal(verify(sign(P, priv), 'otro', { publicKey: pub, checkInstall: false }).ok, true));
test('otra clave → firma', () => assert.equal(verify(sign(P, keys().privateKey), ID, { publicKey: pub }).motivo, 'firma'));
test('basura → formato', () => assert.equal(verify('hola', ID, { publicKey: pub }).motivo, 'formato'));
test('v desconocido → version', () => assert.equal(verify(sign({ ...P, v: 2 }, priv), ID, { publicKey: pub }).motivo, 'version'));
test('vacío → sin-licencia', () => assert.equal(verify('', ID, { publicKey: pub }).motivo, 'sin-licencia'));
test('inválida cae en BASE', () => assert.deepEqual(verify('hola', ID, { publicKey: pub }).limites, { A: 2, B: 2, C: 2 }));
test('PUBLIC_KEY null → firma', () => assert.equal(verify(sign(P, priv), ID, { publicKey: null }).motivo, 'firma'));
test('módulo desconocido se ignora', () => assert.deepEqual(verify(sign({ ...P, modulos: ['medidores', 'futuro'] }, priv), ID, { publicKey: pub }).modulos, ['medidores']));
test('limites ausentes o inválidos → 0', () => {
  const r = verify(sign({ ...P, limites: { B: 3.7, C: -1 } }, priv), ID, { publicKey: pub });
  assert.deepEqual(r.limites, { A: 0, B: 3, C: 0 });
});
test('install-id con \n se recorta', () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'install-id'), ID + '\n');
  assert.equal(readInstallId(dir), ID);
  assert.equal(readInstallId(tmp()), null);
});
test('ensureInstallId crea UUID v4 una sola vez', () => {
  const dir = tmp(); const a = ensureInstallId(dir);
  assert.match(a, /^[0-9a-f-]{36}$/); assert.equal(ensureInstallId(dir), a);
});
test('load: sin archivo → sin-licencia; con archivo → ok', () => {
  const dir = tmp(); ensureInstallId(dir);
  const r = load(dir, { publicKey: pub });
  assert.equal(r.motivo, 'sin-licencia'); assert.match(r.installId, /^[0-9a-f-]{36}$/);
  fs.writeFileSync(path.join(dir, 'license.key'), sign({ ...P, installId: r.installId }, priv));
  assert.equal(load(dir, { publicKey: pub }).ok, true);
});
test('tier', () => { assert.equal(tier('device', {}), 'B'); assert.equal(tier('meter', {}), 'B'); assert.equal(tier('meter', { waveform: {} }), 'C'); });
test('usage ignora deshabilitados y listas ausentes', () => {
  assert.deepEqual(usage({}), { A: 0, B: 0, C: 0 });
  assert.deepEqual(usage({ devices: [{ name: 'a' }, { name: 'b', enabled: false }], meters: [{ name: 'm', waveform: {} }] }), { A: 0, B: 1, C: 1 });
});
test('allowed: 22 variadores, límite B 20 → 20 primeros', () => {
  const devices = Array.from({ length: 22 }, (_, i) => ({ name: 'd' + i }));
  const a = allowed({ devices }, { modulos: [], limites: { B: 20 } });
  assert.equal(a.devices.size, 20); assert.equal(a.devices.has('d20'), false);
});
test('allowed: mismo nombre en variador y medidor no se pisa', () => {
  const a = allowed({ devices: [{ name: 'X' }], meters: [{ name: 'X' }] }, { modulos: ['medidores'], limites: { B: 1 } });
  assert.equal(a.devices.has('X'), true); assert.equal(a.meters.has('X'), false);
});
test('allowed: sin módulo medidores no hay medidores', () => assert.equal(allowed({ meters: [{ name: 'm' }] }, { modulos: [], limites: { B: 5 } }).meters.size, 0));
test('check', () => {
  assert.deepEqual(check({ devices: [{ name: 'a' }, { name: 'b' }] }, { modulos: [], limites: { B: 1 } }), ['Límite de la licencia: nivel B 2/1']);
  assert.match(check({ meters: [{ name: 'm' }] }, { modulos: [], limites: { B: 5 } })[0], /medidores/);
});
test('check con prev: ya excedido y sin aumento → []', () => {
  const lic = { modulos: [], limites: { B: 1 } };
  const prev = { devices: [{ name: 'a' }, { name: 'b' }] };
  assert.deepEqual(check({ devices: [{ name: 'a' }, { name: 'b' }] }, lic, prev), []);
  assert.deepEqual(check({ devices: [{ name: 'a' }] }, lic, prev), []);
  assert.deepEqual(check({ devices: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, lic, prev), ['Límite de la licencia: nivel B 3/1']);
});
test('check con prev: medidores sin módulo solo si aumentan', () => {
  const lic = { modulos: [], limites: { B: 5 } };
  const prev = { meters: [{ name: 'm' }] };
  assert.deepEqual(check({ meters: [{ name: 'm' }] }, lic, prev), []);
  assert.match(check({ meters: [{ name: 'm' }, { name: 'n' }] }, lic, prev)[0], /medidores/);
});

test('installId: mayúsculas y espacios no importan', () => {
  assert.equal(verify(sign(P, priv), ' ' + ID.toUpperCase() + '\n', { publicKey: pub }).ok, true);
  assert.equal(verify(sign({ ...P, installId: ID.toUpperCase() }, priv), ID, { publicKey: pub }).ok, true);
});
test('install-id local ausente → otra-instalacion (aunque la licencia no traiga installId)', () => {
  const { installId, ...sinId } = P;
  assert.equal(verify(sign(sinId, priv), null, { publicKey: pub }).motivo, 'otra-instalacion');
  assert.equal(verify(sign(P, priv), '', { publicKey: pub }).motivo, 'otra-instalacion');
});
test('usage/check con lic: sin módulo medidores los medidores no cuentan', () => {
  const cfg = { devices: [], meters: [{ name: 'M1' }, { name: 'M2' }, { name: 'M3' }] };
  const sin = { modulos: [], limites: { A: 0, B: 1, C: 0 } };
  const con = { modulos: ['medidores'], limites: { A: 0, B: 1, C: 0 } };
  assert.equal(usage(cfg).B, 3);               // sin lic: cuenta todo
  assert.equal(usage(cfg, sin).B, 0);
  assert.equal(usage(cfg, con).B, 3);
  assert.deepEqual(check(cfg, sin).filter((e) => e.includes('nivel')), []);
  assert.equal(check(cfg, con).filter((e) => e.includes('nivel B')).length, 1);
});
