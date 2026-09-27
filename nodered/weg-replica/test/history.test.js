'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistorySync, IDLE_MS, MIN_BACKOFF_MS, MAX_BACKOFF_MS } = require('../src/history');

function memCursor(initial = null) {
  let v = initial; const saves = [];
  return { load: () => v, save: (s) => { v = s; saves.push(s); }, saves };
}
const quiet = { log() {}, error() {} };

test('first run starts at info.oldest and saves cursor after writing', async () => {
  const written = [];
  const cursor = memCursor();
  const source = {
    info: async () => ({ oldest: '2026-09-08T10:00:00Z' }),
    points: async (since, win) => { assert.equal(since, '2026-09-08T10:00:00Z'); assert.equal(win, 3600); return { body: 'L1', next: '2026-09-08T11:00:00.000Z', more: true }; },
  };
  const h = createHistorySync({ source, write: async (b) => written.push(b), cursor, sleep: async () => {}, log: quiet });
  assert.equal(await h.step(), 0);
  assert.deepEqual(written, ['L1']);
  assert.deepEqual(cursor.saves, ['2026-09-08T11:00:00.000Z']);
});

test('empty plant (no oldest) waits idle without saving', async () => {
  const cursor = memCursor();
  const h = createHistorySync({ source: { info: async () => ({ oldest: null }) }, write: async () => {}, cursor, sleep: async () => {}, log: quiet });
  assert.equal(await h.step(), IDLE_MS);
  assert.deepEqual(cursor.saves, []);
});

test('cursor does not advance if the local write fails', async () => {
  const cursor = memCursor('2026-09-27T10:00:00.000Z');
  const source = { points: async () => ({ body: 'L', next: '2026-09-27T11:00:00.000Z', more: false }) };
  const h = createHistorySync({ source, write: async () => { throw new Error('influx down'); }, cursor, sleep: async () => {}, log: quiet });
  await assert.rejects(h.step(), /influx down/);
  assert.deepEqual(cursor.saves, []);
});

test('up to date → idle wait; status reports lastSync and cursor', async () => {
  const statuses = [];
  const cursor = memCursor('2026-09-27T11:59:00.000Z');
  const source = { points: async () => ({ body: '', next: '2026-09-27T11:59:50.000Z', more: false }) };
  const h = createHistorySync({ source, write: async () => {}, cursor, sleep: async () => {}, onStatus: (s) => statuses.push(s), log: quiet });
  assert.equal(await h.step(), IDLE_MS);
  assert.equal(statuses.at(-1).cursor, '2026-09-27T11:59:50.000Z');
  assert.equal(statuses.at(-1).error, null);
  assert.equal(typeof statuses.at(-1).lastSync, 'number');
});

test('run catches up a backlog without idle waits, then idles', async () => {
  const cursor = memCursor('2026-09-20T00:00:00.000Z');
  let n = 0;
  const source = {
    points: async (since) => {
      n++;
      const next = new Date(Date.parse(since) + 3600e3).toISOString();
      return { body: `L${n}`, next, more: n < 5 };
    },
  };
  const waits = [];
  let h;
  const sleep = async (ms) => { waits.push(ms); if (ms === IDLE_MS) h.stop(); };
  h = createHistorySync({ source, write: async () => {}, cursor, sleep, log: quiet });
  await h.run();
  assert.equal(n, 5);
  assert.deepEqual(waits, [IDLE_MS]);                 // ninguna espera durante el catch-up
  assert.equal(cursor.load(), '2026-09-20T05:00:00.000Z');
  const times = cursor.saves.map(Date.parse);
  assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]));  // monótono
});

test('run backs off exponentially on errors and waits max on 401', async () => {
  const errs = [new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), Object.assign(new Error('401'), { status: 401 })];
  const source = { points: async () => { throw errs.shift(); } };
  const waits = [];
  let h;
  const sleep = async (ms) => { waits.push(ms); if (waits.length === 3) h.stop(); };
  h = createHistorySync({ source, write: async () => {}, cursor: memCursor('2026-09-27T00:00:00.000Z'), sleep, log: quiet });
  await h.run();
  assert.deepEqual(waits, [MIN_BACKOFF_MS, MIN_BACKOFF_MS * 2, MAX_BACKOFF_MS]);
});
