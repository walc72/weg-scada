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

// Influx responde 400 cuando rechaza líneas (p.ej. un campo que cambió de
// tipo) pero escribe las válidas: reintentar la misma ventana no la arregla
// nunca, así que se registra y se sigue (si no, la réplica queda trabada).
test('a window rejected by Influx (400) is logged and skipped, not retried forever', async () => {
  const cursor = memCursor('2026-09-27T10:00:00.000Z');
  const errors = [];
  const statuses = [];
  const source = { points: async () => ({ body: 'L', next: '2026-09-27T11:00:00.000Z', more: true }) };
  const write = async () => { throw Object.assign(new Error('Influx write HTTP 400: field type conflict'), { status: 400 }); };
  const h = createHistorySync({ source, write, cursor, sleep: async () => {}, onStatus: (p) => statuses.push(p), log: { log() {}, error: (m) => errors.push(m) } });
  assert.equal(await h.step(), 0);
  assert.deepEqual(cursor.saves, ['2026-09-27T11:00:00.000Z']);
  assert.match(errors.join('\n'), /rechaz/i);
  assert.match(statuses.at(-1).error, /rechaz/i);
});

test('Influx auth or server errors still do not advance the cursor', async () => {
  for (const status of [401, 403, 500]) {
    const cursor = memCursor('2026-09-27T10:00:00.000Z');
    const source = { points: async () => ({ body: 'L', next: '2026-09-27T11:00:00.000Z', more: false }) };
    const write = async () => { throw Object.assign(new Error(`Influx write HTTP ${status}`), { status }); };
    const h = createHistorySync({ source, write, cursor, sleep: async () => {}, log: quiet });
    await assert.rejects(h.step());
    assert.deepEqual(cursor.saves, [], `status ${status}`);
  }
});

// Un error de sintaxis hace que Influx rechace el lote ENTERO: se parte el lote
// para descartar solo las líneas malas y no perder una hora de datos.
test('on 400 the batch is split so only the bad lines are dropped', async () => {
  const cursor = memCursor('2026-09-27T10:00:00.000Z');
  const stored = [];
  const write = async (body) => {
    const lines = body.split('\n').filter(Boolean);
    if (lines.some(l => l.includes('MALA'))) throw Object.assign(new Error('Influx write HTTP 400: unable to parse'), { status: 400 });
    stored.push(...lines);
  };
  const body = ['a 1', 'b 2', 'MALA', 'c 3', 'd 4', 'e 5'].join('\n');
  const source = { points: async () => ({ body, next: '2026-09-27T11:00:00.000Z', more: false }) };
  const h = createHistorySync({ source, write, cursor, sleep: async () => {}, log: quiet });
  await h.step();
  assert.deepEqual(stored.sort(), ['a 1', 'b 2', 'c 3', 'd 4', 'e 5']);
  assert.deepEqual(cursor.saves, ['2026-09-27T11:00:00.000Z']);
});

test('the count of dropped lines is kept across windows', async () => {
  const cursor = memCursor('2026-09-27T10:00:00.000Z');
  const statuses = [];
  let n = 0;
  const write = async (body) => { if (body.includes('MALA')) throw Object.assign(new Error('HTTP 400'), { status: 400 }); };
  const source = { points: async () => ({ body: n++ === 0 ? 'ok 1\nMALA' : 'ok 2', next: `2026-09-27T1${n}:00:00.000Z`, more: true }) };
  const h = createHistorySync({ source, write, cursor, sleep: async () => {}, onStatus: (p) => statuses.push(p), log: quiet });
  await h.step(); await h.step();
  assert.equal(statuses.at(-1).droppedLines, 1);
});
