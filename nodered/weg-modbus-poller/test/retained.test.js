'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeTopic, topicsToClear, excededTopics } = require('../src/retained');

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

test('excededTopics: solo equipos habilitados fuera de lo permitido', () => {
  const c = cfg([{ name: 'd0' }, { name: 'd1' }, { name: 'd 2' }, { name: 'd3', enabled: false }], []);
  const allowed = { devices: new Set(['d0', 'd1']), meters: new Set() };
  assert.deepEqual(excededTopics(c, allowed), [{ topic: 'weg/drives/d_2', name: 'd 2', kind: 'device' }]);
});

test('excededTopics: medidores fuera de lo permitido; los que no se leen no cuentan', () => {
  const c = cfg([], [
    { name: 'm0', type: 'PM8000' },
    { name: 'm1', type: 'OTRO' },
    { name: 'm2', type: 'PM7400', enabled: false },
  ]);
  const allowed = { devices: new Set(), meters: new Set() };
  assert.deepEqual(excededTopics(c, allowed), [{ topic: 'weg/meters/m0', name: 'm0', kind: 'meter' }]);
});

test('excededTopics: mismo nombre en variador y medidor se distingue por kind', () => {
  const c = cfg([{ name: 'X' }], [{ name: 'X', type: 'PM8000' }]);
  const allowed = { devices: new Set(['X']), meters: new Set() };
  assert.deepEqual(excededTopics(c, allowed), [{ topic: 'weg/meters/X', name: 'X', kind: 'meter' }]);
});

test('caudalímetros borrados o desactivados se limpian', () => {
  const before = { ...cfg([], []), flowmeters: [{ name: 'TUF 1' }, { name: 'TUF 2' }, { name: 'TUF 3' }] };
  const after = { ...cfg([], []), flowmeters: [{ name: 'TUF 1' }, { name: 'TUF 2', enabled: false }] };
  assert.deepEqual(topicsToClear(before, after).sort(), ['weg/flow/TUF_2', 'weg/flow/TUF_3']);
});

test('config sin flowmeters: nada nuevo que limpiar', () => {
  assert.deepEqual(topicsToClear(cfg([{ name: 'SAER 1' }], []), cfg([{ name: 'SAER 1' }], [])), []);
});

test('excededTopics: caudalímetro excedido', () => {
  const c = { ...cfg([], []), flowmeters: [{ name: 'TUF 1' }, { name: 'Colector Norte' }, { name: 'Off', enabled: false }] };
  const allowed = { devices: new Set(), meters: new Set(), flowmeters: new Set(['TUF 1']) };
  assert.deepEqual(excededTopics(c, allowed), [{ topic: 'weg/flow/Colector_Norte', name: 'Colector Norte', kind: 'flowmeter' }]);
});

test('comms borrados o desactivados se limpian', () => {
  const before = { ...cfg([], []), comms: [{ name: 'Radio 1' }, { name: 'Radio 2' }, { name: 'RUT' }] };
  const after = { ...cfg([], []), comms: [{ name: 'Radio 1' }, { name: 'Radio 2', enabled: false }] };
  assert.deepEqual(topicsToClear(before, after).sort(), ['weg/comm/RUT', 'weg/comm/Radio_2']);
});

test('excededTopics: comm habilitado no permitido', () => {
  const c = { ...cfg([], []), comms: [{ name: 'Radio 1' }, { name: 'Radio 2' }, { name: 'Off', enabled: false }] };
  const allowed = { devices: new Set(), meters: new Set(), flowmeters: new Set(), comms: new Set(['Radio 1']) };
  assert.deepEqual(excededTopics(c, allowed), [{ topic: 'weg/comm/Radio_2', name: 'Radio 2', kind: 'comm' }]);
});

test('reconectadores borrados o desactivados se limpian', () => {
  const before = { ...cfg([], []), reconectadores: [{ name: 'Reco 1' }, { name: 'Reco 2' }], reguladores: [{ name: 'Reg 1' }] };
  const after = { ...cfg([], []), reconectadores: [{ name: 'Reco 2', enabled: false }], reguladores: [{ name: 'Reg 1' }] };
  assert.deepEqual(topicsToClear(before, after).sort(), ['weg/reco/Reco_1', 'weg/reco/Reco_2']);
});

test('excededTopics reco/reg: habilitados fuera de allowed', () => {
  const c = { ...cfg([], []), reconectadores: [{ name: 'Reco 1' }, { name: 'R2' }], reguladores: [{ name: 'Reg 1' }, { name: 'Off', enabled: false }] };
  const allowed = { devices: new Set(), meters: new Set(), reconectadores: new Set(['R2']), reguladores: new Set() };
  assert.deepEqual(excededTopics(c, allowed), [
    { topic: 'weg/reco/Reco_1', name: 'Reco 1', kind: 'reco' },
    { topic: 'weg/reg/Reg_1', name: 'Reg 1', kind: 'reg' },
  ]);
});
