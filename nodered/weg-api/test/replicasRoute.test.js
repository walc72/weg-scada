'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const createReplicasRouter = require('../src/routes/replicas');
const { createRegistry } = require('../src/services/replicas');

async function serve({ role = 'superadmin', isReplica = false, legacyToken = '' } = {}) {
  const registry = createRegistry({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rs-')), 'replicas.json') });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/replicas', createReplicasRouter({ registry, isReplica, legacyToken }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/replicas`;
  const call = (method, p = '', body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { call, registry, close: () => new Promise(r => server.close(r)) };
}

test('superadmin creates, lists and revokes; code only in the create response', async () => {
  const s = await serve();
  try {
    const cr = await s.call('POST', '', { name: 'Oficina', plantUrl: 'http://100.97.47.25:9090' });
    assert.equal(cr.status, 200);
    const body = await cr.json();
    assert.match(body.code, /^WEGR1-/);
    const list = await (await s.call('GET')).json();
    assert.equal(list.replicas.length, 1);
    assert.equal(JSON.stringify(list).includes(body.code), false);
    const del = await s.call('DELETE', '/' + body.replica.id);
    assert.equal((await del.json()).status, 'revocada');
    assert.equal((await s.call('DELETE', '/r_nope')).status, 404);
  } finally { await s.close(); }
});

test('bad input → 400', async () => {
  const s = await serve();
  try { assert.equal((await s.call('POST', '', { name: '', plantUrl: 'http://x' })).status, 400); } finally { await s.close(); }
});

test('legacy .env token appears as a non-revocable entry', async () => {
  const s = await serve({ legacyToken: 'x'.repeat(64) });
  try {
    const list = await (await s.call('GET')).json();
    assert.deepEqual(list.replicas.map(r => r.name), ['Réplica heredada (.env)']);
    const del = await s.call('DELETE', '/env');
    assert.equal(del.status, 409);
    assert.match((await del.json()).error, /REPLICA_TOKEN del \.env de planta/);
  } finally { await s.close(); }
});

test('operador and admin → 403; replica server → 409', async () => {
  for (const role of ['operador', 'admin']) {
    const op = await serve({ role });
    try { assert.equal((await op.call('GET')).status, 403); } finally { await op.close(); }
  }
  const rep = await serve({ isReplica: true });
  try {
    const r = await rep.call('GET');
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'Solo disponible en planta');
  } finally { await rep.close(); }
});
