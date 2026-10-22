'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pumpFlow } = require('../src/flow');

const manual = (nominal) => ({ name: 'B1', caudal: { modo: 'manual', nominal } });
const real = { name: 'B1', caudal: { modo: 'real' } };
const on = { online: true, running: true };
const off = { online: true, running: false };
const offline = { online: false, running: false };
const fmPropio = { name: 'TUF 1', bombas: ['B1'] };
const fmColector = { name: 'Colector', bombas: ['B1', 'B2'] };
const st = (o) => new Map([[o.name || 'TUF 1', { online: true, flow: 420, error: 0, allowed: true, enabled: true, ...o }]]);
const of = (fm) => new Map(fm.bombas.map((b) => [b, fm]));

test('pumpFlow: manual en marcha = nominal, parada = 0, OFFLINE sin valor', () => {
  assert.deepEqual(pumpFlow(manual(850), on, new Map(), new Map()), { flow: 850, flowMode: 'manual' });
  assert.deepEqual(pumpFlow(manual(850), off, new Map(), new Map()), { flow: 0, flowMode: 'manual' });
  assert.deepEqual(pumpFlow(manual(850), offline, new Map(), new Map()), { flowMode: 'manual' });
});

test('pumpFlow: manual con nominal 0 o ausente no muestra caudal', () => {
  assert.deepEqual(pumpFlow(manual(0), on, new Map(), new Map()), {});
  assert.deepEqual(pumpFlow({ name: 'B1', caudal: { modo: 'manual' } }, on, new Map(), new Map()), {});
});

test('pumpFlow: real con caudalímetro propio online = su caudal', () => {
  assert.deepEqual(pumpFlow(real, off, st({}), of(fmPropio)), { flow: 420, flowMode: 'real' });
});

test('pumpFlow: real sin valor si el caudalímetro tiene error, está offline, fuera de licencia o deshabilitado', () => {
  assert.deepEqual(pumpFlow(real, on, st({ error: 8 }), of(fmPropio)), { flowMode: 'real' });
  assert.deepEqual(pumpFlow(real, on, st({ flow: null }), of(fmPropio)), { flowMode: 'real' });
  assert.deepEqual(pumpFlow(real, on, st({ online: false }), of(fmPropio)), { flowMode: 'real' });
  assert.deepEqual(pumpFlow(real, on, st({ allowed: false }), of(fmPropio)), { flowMode: 'real' });
  assert.deepEqual(pumpFlow(real, on, st({ enabled: false }), of(fmPropio)), { flowMode: 'real' });
  assert.deepEqual(pumpFlow(real, on, new Map(), of(fmPropio)), { flowMode: 'real' });
  assert.deepEqual(pumpFlow(real, on, new Map(), new Map()), { flowMode: 'real' });
});

test('pumpFlow: colector → flowMode colector y flowMeter, sin caudal propio', () => {
  assert.deepEqual(pumpFlow(real, on, st({ name: 'Colector' }), of(fmColector)), { flowMode: 'colector', flowMeter: 'Colector' });
});

test('pumpFlow: bomba sin caudal y config sin caudalímetros → exactamente {}', () => {
  assert.deepEqual(pumpFlow({ name: 'B1' }, on, new Map(), new Map()), {});
  assert.deepEqual(pumpFlow({ name: 'B1' }, on, st({}), of(fmPropio)), {});
  assert.deepEqual(pumpFlow({ name: 'B1', caudal: {} }, on, new Map(), new Map()), {});
});
