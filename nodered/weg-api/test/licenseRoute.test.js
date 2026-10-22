'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const license = require('../src/services/license');
const { createLicenseState, createLicenseRouter } = require('../src/routes/license');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const CONFIG = { devices: [{ name: 'v1' }], meters: [] };

async function serve(role, { isReplica = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-route-'));
  const installId = license.ensureInstallId(dir);
  const state = createLicenseState({ configDir: dir, isReplica, publicKey: PEM });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/license', createLicenseRouter({ state, getConfig: () => CONFIG, configDir: dir, isReplica }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    dir, installId,
    get: () => fetch(base + '/api/license'),
    put: (body) => fetch(base + '/api/license', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    close: () => new Promise((r) => { server.close(r); fs.rmSync(dir, { recursive: true, force: true }); }),
  };
}

test('GET como operador: estado sin licencia', async () => {
  const s = await serve('operador');
  try {
    const res = await s.get();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      installId: s.installId, ok: false, motivo: 'sin-licencia', cliente: null, modulos: [],
      limites: { A: 2, B: 2, C: 2 }, uso: { A: 0, B: 1, C: 0 },
    });
  } finally { await s.close(); }
});

test('PUT como admin da 403', async () => {
  const s = await serve('admin');
  try { assert.equal((await s.put({ text: 'x' })).status, 403); } finally { await s.close(); }
});

test('PUT en réplica da 403', async () => {
  const s = await serve('superadmin', { isReplica: true });
  try { assert.equal((await s.put({ text: 'x' })).status, 403); } finally { await s.close(); }
});

test('PUT superadmin con basura: 400 formato y sin archivo', async () => {
  const s = await serve('superadmin');
  try {
    const res = await s.put({ text: 'basura' });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Licencia inválida', motivo: 'formato' });
    assert.equal(fs.existsSync(path.join(s.dir, 'license.key')), false);
  } finally { await s.close(); }
});

test('PUT sin text, no string o > 8 KB: 400', async () => {
  const s = await serve('superadmin');
  try {
    for (const body of [{}, { text: 5 }, { text: 'a'.repeat(8193) }]) {
      const res = await s.put(body);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: 'Licencia inválida', motivo: 'formato' });
    }
  } finally { await s.close(); }
});

test('PUT superadmin con licencia válida: guarda recortada y GET ok', async () => {
  const s = await serve('superadmin');
  try {
    const text = license.sign({ v: 1, installId: s.installId, cliente: 'ACME', modulos: ['medidores'], limites: { A: 5, B: 5, C: 1 } }, privateKey);
    const res = await s.put({ text: `  ${text}\n` });
    assert.equal(res.status, 200);
    assert.equal(fs.readFileSync(path.join(s.dir, 'license.key'), 'utf8').trim(), text);
    const g = await (await s.get()).json();
    assert.equal(g.ok, true);
    assert.equal(g.cliente, 'ACME');
  } finally { await s.close(); }
});

test('PUT licencia de otra instalación: 400 con motivo', async () => {
  const s = await serve('superadmin');
  try {
    const text = license.sign({ v: 1, installId: 'otro', modulos: [], limites: { A: 1, B: 1, C: 1 } }, privateKey);
    const res = await s.put({ text });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).motivo, 'otra-instalacion');
  } finally { await s.close(); }
});

test('watch recarga al aparecer license.key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-watch-'));
  const installId = license.ensureInstallId(dir);
  // Intervalo corto: con el de producción (3 s) el test dependía del tiempo del runner de CI.
  const state = createLicenseState({ configDir: dir, publicKey: PEM, interval: 100 });
  const w = state.watch();
  try {
    await new Promise((r) => w.once('ready', r));
    fs.writeFileSync(path.join(dir, 'license.key'), license.sign({ v: 1, installId, modulos: [], limites: { A: 3, B: 3, C: 3 } }, privateKey));
    for (let i = 0; i < 100 && !state.get().ok; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(state.get().ok, true);
  } finally { await w.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('watch: borrar license.key vuelve a modo base', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-unlink-'));
  const installId = license.ensureInstallId(dir);
  const file = path.join(dir, 'license.key');
  fs.writeFileSync(file, license.sign({ v: 1, installId, modulos: [], limites: { A: 3, B: 3, C: 3 } }, privateKey));
  const state = createLicenseState({ configDir: dir, publicKey: PEM, interval: 100 });
  assert.equal(state.get().ok, true);
  const w = state.watch();
  try {
    await new Promise((r) => w.once('ready', r));
    fs.rmSync(file);
    for (let i = 0; i < 100 && state.get().ok; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(state.get().ok, false);
    assert.equal(state.get().motivo, 'sin-licencia');
  } finally { await w.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
