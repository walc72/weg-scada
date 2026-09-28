'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeTopic, topicsToClear } = require('../src/retained');

const cfg = (devices, meters) => ({ mqtt: { topicPrefix: 'weg/drives' }, devices, meters });

test('sanitizeTopic replaces MQTT wildcards, slash and spaces', () => {
  assert.equal(sanitizeTopic('SAER 8'), 'SAER_8');
  assert.equal(sanitizeTopic('a/b#c+d'), 'a_b_c_d');
});

test('deleted drives are cleared', () => {
  const before = cfg([{ name: 'SAER 1' }, { name: 'SAER 2' }], []);
  const after = cfg([{ name: 'SAER 1' }], []);
  assert.deepEqual(topicsToClear(before, after), ['weg/drives/SAER_2']);
});

// Antes solo se limpiaban las bombas: un medidor borrado quedaba retenido para
// siempre en planta (y en la oficina).
test('deleted or disabled meters are cleared too', () => {
  const before = cfg([], [
    { name: 'PM8000', type: 'PM8000' },
    { name: 'PM 7400', type: 'PM7400' },
    { name: 'Viejo', type: 'PM8000' },
  ]);
  const after = cfg([], [
    { name: 'PM8000', type: 'PM8000' },
    { name: 'PM 7400', type: 'PM7400', enabled: false },
  ]);
  assert.deepEqual(topicsToClear(before, after).sort(), ['weg/meters/PM_7400', 'weg/meters/Viejo']);
});

test('nothing to clear when nothing was removed', () => {
  const c = cfg([{ name: 'SAER 1' }], [{ name: 'PM8000', type: 'PM8000' }]);
  assert.deepEqual(topicsToClear(c, c), []);
});
