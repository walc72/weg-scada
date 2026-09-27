'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConnection } = require('../src/connection');
const { createManager } = require('../src/manager');
const { createCursorStore } = require('../src/cursor');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'conn-'));
const quiet = { log() {}, error() {} };

test('file wins over env; env is the fallback; nothing → null', () => {
  const d = tmp(); const file = path.join(d, 'replica.json');
  const env = { REPLICA_SOURCE: 'http://env:9090/', REPLICA_TOKEN: 'e' };
  assert.equal(loadConnection({ file, env: {} }), null);
  assert.deepEqual(loadConnection({ file, env }), { source: 'http://env:9090', token: 'e', name: '', from: 'env' });
  fs.writeFileSync(file, JSON.stringify({ source: 'http://file:9090', token: 'f', name: 'Oficina' }));
  assert.deepEqual(loadConnection({ file, env }), { source: 'http://file:9090', token: 'f', name: 'Oficina', from: 'file' });
  fs.writeFileSync(file, '{roto');
  assert.equal(loadConnection({ file, env }).from, 'env');
});

test('manager starts, keeps, restarts and stops runtimes as the connection changes', () => {
  let conn = null; const events = [];
  const m = createManager({ load: () => conn, start: (c) => { events.push(`start ${c.source} ${c.token}`); return { stop: () => events.push(`stop ${c.token}`) }; }, log: quiet });
  assert.equal(m.tick(), false);
  conn = { source: 'http://a', token: '1', from: 'file' };
  assert.equal(m.tick(), true);
  assert.equal(m.tick(), false);
  conn = { source: 'http://a', token: '2', from: 'file' };
  m.tick();
  conn = null;
  m.tick();
  assert.deepEqual(events, ['start http://a 1', 'stop 1', 'start http://a 2', 'stop 2']);
  assert.equal(m.connection(), null);
});

test('cursor survives a token change but not a source change', () => {
  const file = path.join(tmp(), 'cursor.json');
  createCursorStore(file, 'http://a').save('2026-09-20T00:00:00.000Z');
  assert.equal(createCursorStore(file, 'http://a').load(), '2026-09-20T00:00:00.000Z');
  assert.equal(createCursorStore(file, 'http://b').load(), null);
  fs.writeFileSync(file, JSON.stringify({ since: '2026-09-01T00:00:00.000Z' })); // cursor viejo sin source
  assert.equal(createCursorStore(file, 'http://a').load(), '2026-09-01T00:00:00.000Z');
});
