'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { createLinkStore, testLink } = require('../src/services/replicaLink');
const createReplicaLinkRouter = require('../src/routes/replicaLink');
const { encodeCode } = require('../src/services/pairingCode');

const TOKEN = 'b'.repeat(64);
const CODE = encodeCode({ url: 'http://planta:9090', token: TOKEN, name: 'Oficina', id: 'r_1' });
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'link-')), 'replica.json');
const jsonRes = (status, obj) => ({ ok: status < 400, status, json: async () => obj });

test('testLink: ok, 401 revoked, 404 disabled, network error, bad code', async () => {
  const ok = await testLink(CODE, { fetchImpl: async (url, init) => {
    assert.equal(url, 'http://planta:9090/api/replica/info');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    return jsonRes(200, { oldest: '2026-09-08T00:00:00Z', newest: '2026-09-27T00:00:00Z' });
  } });
  assert.equal(ok.ok, true);
  assert.equal(ok.oldest, '2026-09-08T00:00:00Z');
  assert.match((await testLink(CODE, { fetchImpl: async () => jsonRes(401, {}) })).error, /revocado/);
  assert.match((await testLink(CODE, { fetchImpl: async () => jsonRes(404, {}) })).error, /no tiene la réplica habilitada/);
  assert.match((await testLink(CODE, { fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } })).error, /ECONNREFUSED/);
  assert.equal((await testLink('basura')).error, 'Código de enlace inválido');
});

test('store round trip and remove', () => {
  const store = createLinkStore({ file: tmpFile() });
  assert.equal(store.read(), null);
  store.save({ source: 'http://p', token: TOKEN, name: 'n', id: 'i', pairedAt: 'x' });
  assert.equal(store.read().token, TOKEN);
  store.remove();
  assert.equal(store.read(), null);
});

async function serve({ role = 'superadmin', isReplica = true, envSource = '', test: t, health } = {}) {
  const store = createLinkStore({ file: tmpFile() });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/replica-link', createReplicaLinkRouter({
    store, isReplica, envSource, healthUrl: 'http://weg-replica:3300/health',
    test: t || (async (code) => (code === CODE
      ? { ok: true, name: 'Oficina', source: 'http://planta:9090', oldest: 'o', newest: 'n', _conn: { url: 'http://planta:9090', token: TOKEN, name: 'Oficina', id: 'r_1' } }
      : { ok: false, error: 'Código de enlace inválido' })),
    fetchImpl: health || (async () => jsonRes(200, { configured: true, live: true, lagSec: 12 })),
  }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/replica-link`;
  const call = (method, p = '', body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { call, store, close: () => new Promise(r => server.close(r)) };
}

test('save, get masked (never the token), sameSource, delete', async () => {
  const s = await serve({ envSource: 'http://planta:9090' });
  try {
    const before = await (await s.call('GET')).json();
    assert.equal(before.fromEnv, true);
    const put = await (await s.call('PUT', '', { code: CODE })).json();
    assert.equal(put.sameSource, true);
    const got = await (await s.call('GET')).json();
    assert.equal(got.source, 'http://planta:9090');
    assert.equal(got.tokenMasked, '…bbbb');
    assert.equal(JSON.stringify(got).includes(TOKEN), false);
    assert.equal(s.store.read().token, TOKEN);
    assert.equal((await s.call('DELETE')).status, 200);
    assert.equal(s.store.read(), null);
  } finally { await s.close(); }
});

test('test and put with a bad code → 400; test never returns the token', async () => {
  const s = await serve();
  try {
    const t = await (await s.call('POST', '/test', { code: CODE })).json();
    assert.equal(t.ok, true);
    assert.equal(JSON.stringify(t).includes(TOKEN), false);
    assert.equal((await s.call('PUT', '', { code: 'x' })).status, 400);
  } finally { await s.close(); }
});

test('status proxies weg-replica /health; 502 if down', async () => {
  const up = await serve();
  try { assert.equal((await (await up.call('GET', '/status')).json()).lagSec, 12); } finally { await up.close(); }
  const down = await serve({ health: async () => { throw new Error('ECONNREFUSED'); } });
  try { assert.equal((await down.call('GET', '/status')).status, 502); } finally { await down.close(); }
});

test('plant server → 409; operador and admin → 403', async () => {
  const p = await serve({ isReplica: false });
  try {
    const r = await p.call('GET');
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'Solo disponible en un servidor réplica');
  } finally { await p.close(); }
  for (const role of ['operador', 'admin']) {
    const op = await serve({ role });
    try { assert.equal((await op.call('GET')).status, 403); } finally { await op.close(); }
  }
});

// El aviso "otra planta" no debe saltar por diferencias de forma en la URL
test('sameSource ignores trailing slash and host case', async () => {
  const s = await serve({ envSource: 'http://PLANTA:9090/' });
  try {
    const put = await (await s.call('PUT', '', { code: CODE })).json();
    assert.equal(put.sameSource, true);
  } finally { await s.close(); }
});

test('sameSource is false for a different plant', async () => {
  const s = await serve({ envSource: 'http://otra:9090' });
  try {
    assert.equal((await (await s.call('PUT', '', { code: CODE })).json()).sameSource, false);
  } finally { await s.close(); }
});

test('PUT answers 500 with a message when the link cannot be saved', async () => {
  const s = await serve();
  s.store.save = () => { throw new Error('EACCES: permission denied'); };
  try {
    const r = await s.call('PUT', '', { code: CODE });
    assert.equal(r.status, 500);
    assert.match((await r.json()).error, /No se pudo guardar/);
  } finally { await s.close(); }
});
