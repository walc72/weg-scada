'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isReplicaMode, replicaWriteGuard } = require('../src/middleware/replicaMode');

function run(guard, method, path) {
  let status = null, body = null, nexted = false;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  guard({ method, path }, res, () => { nexted = true; });
  return { status, body, nexted };
}

test('isReplicaMode reads REPLICA_MODE', () => {
  const prev = process.env.REPLICA_MODE;
  try {
    process.env.REPLICA_MODE = '1'; assert.equal(isReplicaMode(), true);
    process.env.REPLICA_MODE = 'true'; assert.equal(isReplicaMode(), true);
    process.env.REPLICA_MODE = ''; assert.equal(isReplicaMode(), false);
    delete process.env.REPLICA_MODE; assert.equal(isReplicaMode(), false);
  } finally { if (prev === undefined) delete process.env.REPLICA_MODE; else process.env.REPLICA_MODE = prev; }
});

test('blocks config, setpoints, manual writes with 409', () => {
  const g = replicaWriteGuard(true);
  for (const [m, p] of [['PUT', '/api/config'], ['POST', '/api/config/devices'], ['DELETE', '/api/config/devices/SAER 1'],
    ['POST', '/api/config/scan-gateway'], ['PUT', '/api/setpoints/bulk'], ['PUT', '/api/reports/manual']]) {
    const r = run(g, m, p);
    assert.equal(r.status, 409, `${m} ${p}`);
    assert.equal(r.body.error, 'Servidor réplica — los cambios se hacen en planta');
    assert.equal(r.nexted, false);
  }
});

test('lets reads and local settings through', () => {
  const g = replicaWriteGuard(true);
  for (const [m, p] of [['GET', '/api/config'], ['GET', '/api/reports/manual'], ['POST', '/api/settings/users'],
    ['POST', '/api/reports/pdf'], ['PUT', '/api/branding']]) {
    assert.equal(run(g, m, p).nexted, true, `${m} ${p}`);
  }
});

test('disabled guard lets everything through', () => {
  assert.equal(run(replicaWriteGuard(false), 'PUT', '/api/config').nexted, true);
});

// Express enruta sin distinguir mayúsculas y tolera la barra final: el guard
// tiene que cubrir las mismas variantes que llegan a los handlers.
test('blocks case and trailing-slash variants that still reach the handlers', async () => {
  const express = require('express');
  const app = express();
  app.use(replicaWriteGuard(true));
  const cfg = express.Router(); cfg.put('/devices', (req, res) => res.send('reached'));
  const rep = express.Router(); rep.put('/manual', (req, res) => res.send('reached'));
  app.use('/api/config', cfg);
  app.use('/api/reports', rep);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const p of ['/api/CONFIG/devices', '/api/Config/devices/', '/api/reports/MANUAL', '/api/reports/manual/']) {
      assert.equal((await fetch(base + p, { method: 'PUT' })).status, 409, p);
    }
  } finally { await new Promise(r => server.close(r)); }
});
