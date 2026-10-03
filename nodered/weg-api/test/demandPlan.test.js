'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { demandPlan } = require('../src/services/reports');

const NOW = Date.parse('2026-10-03T14:37:20Z');

test('bloques de 15 min alineados al reloj (el primero arranca en su borde)', () => {
  assert.deepEqual(demandPlan('-24h', 'now()', NOW), { every: 900, start: '2026-10-02T14:30:00.000Z' });
  assert.deepEqual(demandPlan('2026-10-01T10:07:00Z', '2026-10-02T10:00:00Z', NOW), { every: 900, start: '2026-10-01T10:00:00.000Z' });
  assert.equal(demandPlan('-7d', 'now()', NOW).every, 900);
  assert.equal(demandPlan('-31d', 'now()', NOW).every, 900);
});

test('rangos de más de 31 días en bloques de 1 h', () => {
  assert.deepEqual(demandPlan('-90d', 'now()', NOW), { every: 3600, start: '2026-07-05T14:00:00.000Z' });
  assert.equal(demandPlan('-6w', 'now()', NOW).every, 3600);
});
