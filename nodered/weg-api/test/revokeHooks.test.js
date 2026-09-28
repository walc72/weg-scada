'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CONFIG_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-')), 'config.json');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { login, logout, isSessionToken, onTokenRevoked } = require('../src/middleware/auth');
const { createRegistry } = require('../src/services/replicas');

test('logout notifies onTokenRevoked and the token stops being a session', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/login', login);
  app.post('/api/logout', logout);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const revoked = [];
  try {
    onTokenRevoked((t) => revoked.push(t));
    const { token } = await (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'admin-pass' }) })).json();
    assert.equal(isSessionToken(token), true);
    assert.equal(isSessionToken('nope'), false);
    await fetch(`${base}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(isSessionToken(token), false);
    assert.deepEqual(revoked, [token]);
  } finally { await new Promise(r => server.close(r)); }
});

test('registry calls onRevoke once per replica', () => {
  const calls = [];
  const reg = createRegistry({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-')), 'replicas.json'), onRevoke: (id) => calls.push(id) });
  const { replica } = reg.create({ name: 'A', plantUrl: 'http://x' });
  reg.revoke(replica.id);
  reg.revoke(replica.id);
  assert.deepEqual(calls, [replica.id]);
});
