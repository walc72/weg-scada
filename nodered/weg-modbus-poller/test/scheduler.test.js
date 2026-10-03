'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createScheduler, commDecision, OFFLINE_AFTER, createRetryGate, OFFLINE_RETRY_MS } = require('../src/scheduler');
const { isTransportError } = require('../src/connections');

// Reloj simulado + grupos que "tardan" lo que se les indica
function harness(durations) {
  let t = 0;
  const runs = {};
  const pending = [];
  const sched = createScheduler({
    intervalMs: 2000,
    now: () => t,
    getGroups: () => new Map(Object.keys(durations).map(k => [k, {}])),
    runGroup: (k) => {
      runs[k] = (runs[k] || 0) + 1;
      return new Promise(res => pending.push({ at: t + durations[k], res }));
    },
  });
  const flush = () => new Promise(r => setImmediate(r));
  async function advance(ms, step = 250) {
    for (let x = 0; x < ms; x += step) {
      t += step;
      for (const p of pending.filter(p => p.at <= t)) { pending.splice(pending.indexOf(p), 1); p.res(); }
      await flush(); await flush();
      sched.tick();
      await flush();
    }
  }
  return { sched, runs, advance, start: async () => { sched.tick(); await flush(); } };
}

test('un grupo lento no frena a los demás', async () => {
  const h = harness({ 'rapido:502': 100, 'adam:502': 9000 });
  await h.start();
  await h.advance(20000);
  // en 20 s: el rápido ~cada 2 s (10 vueltas); el lento ~cada 9 s (2-3)
  assert.ok(h.runs['rapido:502'] >= 9, `rápido: ${h.runs['rapido:502']}`);
  assert.ok(h.runs['adam:502'] <= 3, `lento: ${h.runs['adam:502']}`);
  // la duración típica queda registrada por grupo (se publica como pollMs)
  assert.ok(h.sched.cycleMs('adam:502') >= 8000);
  assert.ok(h.sched.cycleMs('rapido:502') < 1000);
});

test('un grupo no se superpone consigo mismo', async () => {
  let running = 0, maxRunning = 0, t = 0;
  const pending = [];
  const sched = createScheduler({
    intervalMs: 2000, now: () => t,
    getGroups: () => new Map([['g', {}]]),
    runGroup: () => { running++; maxRunning = Math.max(maxRunning, running); return new Promise(r => pending.push(() => { running--; r(); })); },
  });
  const flush = () => new Promise(r => setImmediate(r));
  sched.tick(); await flush(); sched.tick(); await flush();
  t += 5000; sched.tick(); await flush();   // ya le tocaba, pero sigue corriendo
  assert.equal(maxRunning, 1);
  assert.equal(pending.length, 1);
  pending.forEach(f => f());
});

test('grupos que desaparecen de la config se olvidan', async () => {
  let groups = new Map([['a', {}], ['b', {}]]);
  const sched = createScheduler({ intervalMs: 2000, getGroups: () => groups, runGroup: async () => {} });
  sched.tick(); await new Promise(r => setImmediate(r));
  groups = new Map([['a', {}]]);
  sched.tick();
  assert.deepEqual([...sched.state.keys()], ['a']);
});

test(`OFFLINE recién con ${OFFLINE_AFTER} fallas seguidas`, () => {
  assert.equal(commDecision(0, true), 'online');
  assert.equal(commDecision(1, true), 'hold');
  assert.equal(commDecision(OFFLINE_AFTER - 1, true), 'hold');
  assert.equal(commDecision(OFFLINE_AFTER, true), 'offline');
  // si ya estaba caído (o nunca se leyó), no hay nada que sostener
  assert.equal(commDecision(1, false), 'offline');
  assert.equal(commDecision(0, false), 'online');
});

test('excepción Modbus (respuesta del gateway) no es falla de la conexión', () => {
  const exc = Object.assign(new Error('Modbus exception 11: Gateway target device failed to respond'), { modbusCode: 11 });
  assert.equal(isTransportError(exc), false);
  assert.equal(isTransportError(Object.assign(new Error('Timed out'), { name: 'TransactionTimedOutError' })), true);
  assert.equal(isTransportError(new Error('Port Not Open')), true);
});

test('un equipo caído se reintenta cada 30 s, no en cada vuelta', () => {
  const g = createRetryGate();
  assert.equal(OFFLINE_RETRY_MS, 30000);
  assert.equal(g.skip('IMBIL 7', 0), false);          // nunca se leyó: se lee
  g.offline('IMBIL 7', 1000);                          // confirmado caído
  assert.equal(g.skip('IMBIL 7', 3000), true);         // vueltas siguientes: se saltea
  assert.equal(g.skip('IMBIL 7', 30999), true);
  assert.equal(g.skip('IMBIL 7', 31000), false);       // a los 30 s: reintento
  g.offline('IMBIL 7', 31000);                         // sigue caído: otros 30 s
  assert.equal(g.skip('IMBIL 7', 40000), true);
  g.online('IMBIL 7');                                 // volvió: se lee siempre
  assert.equal(g.skip('IMBIL 7', 40000), false);
  assert.equal(g.skip('IMBIL 4', 40000), false);       // no afecta a los demás
});
