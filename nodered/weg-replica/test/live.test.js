'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createLiveBridge } = require('../src/live');

function fakeRemote() { const e = new EventEmitter(); e.subs = []; e.subscribe = (t) => e.subs.push(t); return e; }
function fakeLocal() { const e = new EventEmitter(); e.published = []; e.subs = []; e.subscribe = (t) => e.subs.push(t); e.publish = (t, p, o) => e.published.push({ t, p: String(p), o }); return e; }
function manualTimers() { const q = []; return { set: (fn, ms) => { q.push(fn); return q.length; }, clear: () => {}, flush: () => q.splice(0).forEach(f => f()) }; }
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

// Si la oficina estaba desconectada cuando la planta borró o desactivó un
// equipo, el borrado del retenido nunca llega: al reconectar, lo que la planta
// ya no manda se borra también en la oficina (si no, queda un equipo fantasma).
test('after reconnecting, local retained devices the plant no longer sends are cleared', () => {
  const remote = fakeRemote(); const local = fakeLocal(); const timers = manualTimers();
  createLiveBridge({ remote, local, log: quiet, setTimer: timers.set, clearTimer: timers.clear });
  // retenidos que ya tenía el broker local (de antes de reiniciar/desconectarse)
  local.emit('message', 'weg/drives/SAER 1', Buffer.from('{}'), { retain: true });
  local.emit('message', 'weg/drives/VIEJO', Buffer.from('{}'), { retain: true });
  local.emit('message', 'weg/meters/PM-VIEJO', Buffer.from('{}'), { retain: true });
  local.emit('message', 'weg/poller/status', Buffer.from('{}'), { retain: true });
  remote.emit('connect');
  remote.emit('message', 'weg/drives/SAER 1', Buffer.from('{"a":1}'), { retain: true });
  local.published.length = 0;
  timers.flush();
  const cleared = local.published.filter(m => m.p === '').map(m => m.t).sort();
  assert.deepEqual(cleared, ['weg/drives/VIEJO', 'weg/meters/PM-VIEJO']);
  assert.ok(local.published.every(m => m.o.retain === true));
});

test('no clearing if the connection dropped before the settle time', () => {
  const remote = fakeRemote(); const local = fakeLocal(); const timers = manualTimers();
  createLiveBridge({ remote, local, log: quiet, setTimer: timers.set, clearTimer: timers.clear });
  local.emit('message', 'weg/drives/VIEJO', Buffer.from('{}'), { retain: true });
  remote.emit('connect');
  remote.emit('close');
  local.published.length = 0;
  timers.flush();
  assert.deepEqual(local.published, []);
});
