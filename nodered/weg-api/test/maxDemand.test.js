'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { maxDemandBy, demandSpan } = require('../src/services/reports');

const rows = [
  { _time: '2026-10-03T03:00:00Z', name: 'PM8000', kw: 900 },
  { _time: '2026-10-03T17:15:00Z', name: 'PM8000', kw: 1025.7 },
  { _time: '2026-10-03T17:30:00Z', name: 'PM8000', kw: 1010 },
  { _time: '2026-10-03T10:00:00Z', name: 'PM8000 #3', kw: 856.8 },
];

test('máxima demanda por medidor con su bloque', () => {
  const out = maxDemandBy(rows, 900, Date.parse('2026-10-04T03:00:00Z'));
  assert.deepEqual(out.PM8000, { kw: 1025.7, from: '2026-10-03T17:15:00.000Z', to: '2026-10-03T17:30:00.000Z' });
  assert.equal(out['PM8000 #3'].kw, 856.8);
});

// Día en curso: el bloque que todavía no terminó no cuenta (media parcial)
test('descarta el bloque en curso', () => {
  const stop = Date.parse('2026-10-03T17:40:00Z');
  const out = maxDemandBy([...rows, { _time: '2026-10-03T17:30:00Z', name: 'PM8000', kw: 2000 }], 900, stop);
  assert.equal(out.PM8000.kw, 1025.7);
});

test('demandSpan en hora local', () => {
  const d = { from: '2026-10-03T17:15:00.000Z', to: '2026-10-03T17:30:00.000Z' };
  assert.equal(demandSpan(d, 'America/Argentina/Cordoba'), '14:15–14:30');
  assert.equal(demandSpan(null), '-');
});
