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

async function serve(role, { isReplica = false, renew = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-route-'));
  const installId = license.ensureInstallId(dir);
  const state = createLicenseState({ configDir: dir, isReplica, publicKey: PEM });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/license', createLicenseRouter({ state, getConfig: () => CONFIG, configDir: dir, isReplica, renew }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    dir, installId,
    get: () => fetch(base + '/api/license'),
    renovar: () => fetch(base + '/api/license/renovar', { method: 'POST' }),
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
      limites: { A: 2, B: 2, C: 2 }, vence: null, vencen: {}, vencidos: [], equipos: null, panel: false, uso: { A: 0, B: 1, C: 0 },
      usoEquipos: { variadores: 1, medidores: 0, caudalimetros: 0, reconectadores: 0, reguladores: 0, comunicaciones: 0 },
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
  const state = createLicenseState({ configDir: dir, publicKey: PEM, interval: 100, hora: async () => null });
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
  const state = createLicenseState({ configDir: dir, publicKey: PEM, interval: 100, hora: async () => null });
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

test('tick guarda la hora de internet y recarga; horaInternet lee el encabezado Date', async () => {
  const lic = require('../src/services/license');
  const { horaInternet } = require('../src/routes/license');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-tick-'));
  try {
    const futuro = Date.now() + 3 * 86400000;
    const state = createLicenseState({ configDir: dir, publicKey: PEM, hora: async () => futuro });
    await state.tick();
    assert.ok(lic.trustedNow(dir) >= futuro);
    const fake = async () => ({ headers: { get: () => new Date(futuro).toUTCString() } });
    assert.equal(await horaInternet(['https://x'], fake), Math.floor(futuro / 1000) * 1000);
    assert.equal(await horaInternet(['https://x'], async () => { throw new Error('sin red'); }), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST /renovar: superadmin pide la licencia al panel; mensajes por resultado', async () => {
  const resultados = ['actualizada', 'igual', 'sin-gestion', 'error'];
  let i = 0;
  const s = await serve('superadmin', { renew: { renewOnce: async () => resultados[i++] } });
  try {
    const a = await s.renovar(); assert.equal(a.status, 200); assert.equal((await a.json()).resultado, 'actualizada');
    const b = await s.renovar(); assert.equal((await b.json()).mensaje, 'La licencia ya estaba al día');
    const c = await s.renovar(); assert.equal(c.status, 409);
    const d = await s.renovar(); assert.equal(d.status, 502); assert.match((await d.json()).error, /No se pudo contactar/);
  } finally { await s.close(); }
});

test('POST /renovar: admin 403 y réplica (sin renew) 403; GET marca panel si la licencia trae lid', async () => {
  const s = await serve('admin', { renew: { renewOnce: async () => 'igual' } });
  try { assert.equal((await s.renovar()).status, 403); } finally { await s.close(); }
  const r = await serve('superadmin');
  try {
    assert.equal((await r.renovar()).status, 403);
    fs.writeFileSync(path.join(r.dir, 'license.key'), license.sign({ v: 1, installId: r.installId, modulos: [], limites: {}, lid: 'WL-1' }, privateKey));
    assert.equal((await (await r.get()).json()).panel, true);
  } finally { await r.close(); }
});
