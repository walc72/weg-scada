'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createLiveBridge } = require('../src/live');

function fakeRemote() { const e = new EventEmitter(); e.subs = []; e.subscribe = (t) => e.subs.push(t); return e; }
function fakeLocal() { return { published: [], publish(t, p, o) { this.published.push({ t, p: String(p), o }); } }; }
const quiet = { log() {}, error() {} };

test('subscribes to weg/# on connect and reports live status', () => {
  const remote = fakeRemote(); const statuses = [];
  createLiveBridge({ remote, local: fakeLocal(), onStatus: (s) => statuses.push(s), log: quiet });
  remote.emit('connect');
  assert.deepEqual(remote.subs, ['weg/#']);
  remote.emit('close');
  assert.deepEqual(statuses, [{ live: true }, { live: false }]);
});

test('republishes every message with retain=true, including empty payloads', () => {
  const remote = fakeRemote(); const local = fakeLocal();
  const bridge = createLiveBridge({ remote, local, log: quiet });
  remote.emit('message', 'weg/drives/SAER 8', Buffer.from('{"current":12}'), { retain: false });
  remote.emit('message', 'weg/meters/PM8000', Buffer.from(''), { retain: true });
  assert.deepEqual(local.published, [
    { t: 'weg/drives/SAER 8', p: '{"current":12}', o: { qos: 0, retain: true } },
    { t: 'weg/meters/PM8000', p: '', o: { qos: 0, retain: true } },
  ]);
  assert.equal(typeof bridge.lastMessageAt(), 'number');
});

test('ignores weg/replica/* to avoid loops', () => {
  const remote = fakeRemote(); const local = fakeLocal();
  createLiveBridge({ remote, local, log: quiet });
  remote.emit('message', 'weg/replica/status', Buffer.from('{}'), {});
  assert.deepEqual(local.published, []);
});
