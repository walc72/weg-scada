'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const license = require('../src/services/license');
const { createLicenseState } = require('../src/routes/license');
const { createLicenseRenew } = require('../src/services/licenseRenew');

const integ = crypto.generateKeyPairSync('ed25519');
const server = crypto.generateKeyPairSync('ed25519');
const PEMS = [integ, server].map((k) => k.publicKey.export({ type: 'spki', format: 'pem' }));
const quiet = { log() {}, warn() {}, error() {} };

function setup(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-renew-'));
  const installId = license.ensureInstallId(dir);
  const base = { v: 1, installId, cliente: 'Demo', modulos: ['medidores'], limites: { A: 1, B: 5, C: 0 }, lid: 'WL-7', ...payload };
  fs.writeFileSync(path.join(dir, 'license.key'), license.sign(base, server.privateKey) + '\n');
  const state = createLicenseState({ configDir: dir, publicKey: PEMS, hora: async () => null });
  return { dir, installId, base, state };
}
const respond = (body, status = 200) => async () => ({ ok: status < 300, status, json: async () => body });

test('verify acepta una lista de claves (integrador y servidor)', () => {
  const t = license.sign({ v: 1, installId: 'x', modulos: [], limites: {} }, server.privateKey);
  assert.equal(license.verify(t, null, { checkInstall: false, publicKey: PEMS }).ok, true);
  assert.equal(license.verify(t, null, { checkInstall: false, publicKey: PEMS[0] }).motivo, 'firma');
  assert.equal(license.PUBLIC_KEYS.length, 2);
});

test('renovación: guarda la nueva y recarga; igual no reescribe', async () => {
  const s = setup();
  try {
    const nueva = license.sign({ ...s.base, modulos: ['medidores', 'caudales'] }, server.privateKey);
    let sent = null;
    const fetchFn = async (url, opts) => { sent = { url, body: JSON.parse(opts.body) }; return respond({ license: nueva, status: 'ok' })(); };
    const r = createLicenseRenew({ configDir: s.dir, state: s.state, url: 'https://lic.test/', hostname: 'demo-1', fetchFn, log: quiet });
    assert.equal(await r.renewOnce(), 'actualizada');
    assert.equal(sent.url, 'https://lic.test/v1/weg/renew');
    assert.equal(sent.body.hostname, 'demo-1');
    assert.deepEqual(s.state.get().modulos, ['medidores', 'caudales']);
    assert.equal(await r.renewOnce(), 'igual');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test('renovación: la baja llega como licencia vencida y se aplica', async () => {
  const s = setup();
  try {
    const baja = license.sign({ ...s.base, vence: new Date(Date.now() - 1000).toISOString() }, server.privateKey);
    const r = createLicenseRenew({ configDir: s.dir, state: s.state, url: 'https://lic.test', fetchFn: respond({ license: baja, status: 'revoked' }), log: quiet });
    assert.equal(await r.renewOnce(), 'actualizada');
    assert.equal(s.state.get().motivo, 'vencida');
    assert.deepEqual(s.state.get().modulos, []);
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test('renovación: rechaza otra instalación u otra firma; sin red o sin lid no toca nada', async () => {
  const s = setup();
  try {
    const keyFile = path.join(s.dir, 'license.key');
    const antes = fs.readFileSync(keyFile, 'utf8');
    const mk = (fetchFn) => createLicenseRenew({ configDir: s.dir, state: s.state, url: 'https://lic.test', fetchFn, log: quiet });
    const otra = license.sign({ ...s.base, installId: crypto.randomUUID() }, server.privateKey);
    assert.equal(await mk(respond({ license: otra })).renewOnce(), 'rechazada');
    const ajena = license.sign(s.base, crypto.generateKeyPairSync('ed25519').privateKey);
    assert.equal(await mk(respond({ license: ajena })).renewOnce(), 'rechazada');
    assert.equal(await mk(async () => { throw new Error('sin red'); }).renewOnce(), 'error');
    assert.equal(await mk(respond({ error: 'unmanaged' }, 404)).renewOnce(), 'error');
    assert.equal(fs.readFileSync(keyFile, 'utf8'), antes);
    // Firmada a mano (sin lid): ni se consulta
    fs.writeFileSync(keyFile, license.sign({ ...s.base, lid: undefined }, integ.privateKey));
    let called = false;
    assert.equal(await mk(async () => { called = true; }).renewOnce(), 'sin-gestion');
    assert.equal(called, false);
    assert.equal(await createLicenseRenew({ configDir: s.dir, state: s.state, url: '', log: quiet }).renewOnce(), 'sin-gestion');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});
