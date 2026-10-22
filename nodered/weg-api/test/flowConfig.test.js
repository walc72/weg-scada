'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/services/validate');
const { syncFlowmeterPumps } = require('../src/services/flowConfig');

function plant() {
  return {
    pollIntervalMs: 2000,
    devices: Array.from({ length: 16 }, (_, i) => ({
      name: `IMBIL ${i + 1}`, type: 'SSW900', ip: '192.168.10.70', port: 502, unitId: i + 1,
      regOffset: 0, statusOffset: 679, gateway: 'ADAM', enabled: true,
    })),
    meters: Array.from({ length: 4 }, (_, i) => ({
      name: `PM ${i + 1}`, type: 'PM8000', ip: `192.168.10.${20 + i}`, port: 502, unitId: 1,
    })),
    gateways: [],
  };
}
const fm = (o = {}) => ({ name: 'Colector Norte', type: 'TUF2000', ip: '192.168.10.80', port: 502, unitId: 3,
  wordOrder: 'LE', totalMultiplier: 1, bombas: ['IMBIL 5', 'IMBIL 6'], enabled: true, ...o });
const withFm = (...f) => ({ ...plant(), flowmeters: f });

test('config actual de planta (sin caudal ni flowmeters) es valida', () => {
  assert.deepEqual(validateConfig(plant()), []);
});

test('flowmeter valido y caudal manual', () => {
  const c = withFm(fm());
  c.devices[0].caudal = { modo: 'manual', nominal: 850 };
  c.devices[4].caudal = { modo: 'real', nominal: 0 };
  assert.deepEqual(validateConfig(c), []);
});

test('flowmeter: type, wordOrder, totalMultiplier, bombas invalidos', () => {
  assert.ok(validateConfig(withFm(fm({ type: 'X' }))).length);
  assert.ok(validateConfig(withFm(fm({ wordOrder: 'XX' }))).length);
  assert.ok(validateConfig(withFm(fm({ totalMultiplier: 0 }))).length);
  assert.ok(validateConfig(withFm(fm({ bombas: [] }))).length);
  assert.ok(validateConfig(withFm(fm({ bombas: ['IMBIL 5', 'IMBIL 5'] }))).length);
  assert.ok(validateConfig(withFm(fm({ ip: '' }))).length);
  assert.ok(validateConfig(withFm(fm({ enabled: 'si' }))).length);
  assert.ok(validateConfig(withFm(fm(), fm())).length); // nombre repetido
});

test('bomba inexistente', () => {
  const e = validateConfig(withFm(fm({ bombas: ['NOPE'] })));
  assert.ok(e.some(m => m.includes('NOPE')));
});

test('bomba en dos caudalimetros: mensaje exacto', () => {
  const e = validateConfig(withFm(fm(), fm({ name: 'Otro', bombas: ['IMBIL 5'] })));
  assert.ok(e.includes('IMBIL 5 ya está en el caudalímetro Colector Norte'), e.join('|'));
});

test('modo real sin caudalimetro: mensaje exacto; caudal invalido', () => {
  const c = plant();
  c.devices[4].caudal = { modo: 'real', nominal: 0 };
  assert.ok(validateConfig(c).includes('IMBIL 5: modo Real requiere un caudalímetro'));
  c.devices[4].caudal = { modo: 'otro', nominal: -1 };
  assert.ok(validateConfig(c).length >= 1);
});

test('modo real con caudalimetro deshabilitado es valido', () => {
  const c = withFm(fm({ enabled: false }));
  c.devices[4].caudal = { modo: 'real', nominal: 0 };
  assert.deepEqual(validateConfig(c), []);
});

test('borrar bomba la quita de bombas', () => {
  const prev = withFm(fm());
  const next = { ...prev, devices: prev.devices.filter(d => d.name !== 'IMBIL 5') };
  const out = syncFlowmeterPumps(prev, next);
  assert.deepEqual(out.flowmeters[0].bombas, ['IMBIL 6']);
  assert.equal(out.flowmeters[0].enabled, true);
  assert.deepEqual(validateConfig(out), []);
});

test('renombrar bomba la renombra en bombas', () => {
  const prev = withFm(fm());
  const next = { ...prev, devices: prev.devices.map(d => d.name === 'IMBIL 5' ? { ...d, name: 'IMBIL 5B' } : d) };
  const out = syncFlowmeterPumps(prev, next);
  assert.deepEqual(out.flowmeters[0].bombas, ['IMBIL 5B', 'IMBIL 6']);
  assert.deepEqual(validateConfig(out), []);
});

test('ultima bomba borrada: flowmeter queda enabled:false', () => {
  const prev = withFm(fm({ bombas: ['IMBIL 5'] }));
  const next = { ...prev, devices: prev.devices.filter(d => d.name !== 'IMBIL 5') };
  const out = syncFlowmeterPumps(prev, next);
  assert.deepEqual(out.flowmeters[0].bombas, []);
  assert.equal(out.flowmeters[0].enabled, false);
});

test('sync no muta y sin flowmeters devuelve next', () => {
  const prev = plant();
  assert.equal(syncFlowmeterPumps(prev, prev), prev);
});

test('sync + validate de caudalimetro sin bombas (enabled:false) es valido', () => {
  const prev = withFm(fm({ bombas: ['IMBIL 5'] }));
  const next = { ...prev, devices: prev.devices.filter(d => d.name !== 'IMBIL 5') };
  assert.deepEqual(validateConfig(syncFlowmeterPumps(prev, next)), []);
  assert.ok(validateConfig(withFm(fm({ bombas: [], enabled: true }))).length);
});

test('borrar bomba del medio (largo distinto) no renombra a las demas', () => {
  const prev = withFm(fm({ bombas: ['IMBIL 4', 'IMBIL 6', 'IMBIL 7'] }));
  const next = { ...prev, devices: prev.devices.filter(d => d.name !== 'IMBIL 5') };
  assert.deepEqual(syncFlowmeterPumps(prev, next).flowmeters[0].bombas, ['IMBIL 4', 'IMBIL 6', 'IMBIL 7']);
});

test('[A,B,C]->[A,C2]: B y C se quitan, sin renombre', () => {
  const mk = names => ({ devices: names.map(n => ({ name: n })), flowmeters: [{ name: 'F', bombas: ['B', 'C'], enabled: true }] });
  const out = syncFlowmeterPumps(mk(['A', 'B', 'C']), { ...mk(['A', 'C2']) });
  assert.deepEqual(out.flowmeters[0].bombas, []);
  assert.equal(out.flowmeters[0].enabled, false);
});

test('intercambiar nombres no es renombre: bombas sigue por nombre', () => {
  const mk = names => ({ devices: names.map(n => ({ name: n })), flowmeters: [{ name: 'F', bombas: ['A'], enabled: true }] });
  assert.deepEqual(syncFlowmeterPumps(mk(['A', 'B']), mk(['B', 'A'])).flowmeters[0].bombas, ['A']);
});

test('renombrar a un nombre que ya existia no es renombre', () => {
  const mk = names => ({ devices: names.map(n => ({ name: n })), flowmeters: [{ name: 'F', bombas: ['B'], enabled: true }] });
  // B -> A, pero A ya existia: B desaparece y se quita
  const out = syncFlowmeterPumps(mk(['A', 'B']), mk(['A', 'A']));
  assert.deepEqual(out.flowmeters[0].bombas, []);
});

test('[A,B,C]->[A,A2,C] (mismo largo): B se renombra a A2, C sigue', () => {
  const mk = names => ({ devices: names.map(n => ({ name: n })), flowmeters: [{ name: 'F', bombas: ['B', 'C'], enabled: true }] });
  const out = syncFlowmeterPumps(mk(['A', 'B', 'C']), mk(['A', 'A2', 'C']));
  assert.deepEqual(out.flowmeters[0].bombas, ['A2', 'C']);
  assert.equal(out.flowmeters[0].enabled, true);
});

test('caudal.nominal opcional; si viene, numero >= 0', () => {
  const c = plant();
  c.devices[0].caudal = { modo: 'manual' };
  assert.deepEqual(validateConfig(c), []);
  c.devices[0].caudal = { modo: 'manual', nominal: 0 };
  assert.deepEqual(validateConfig(c), []);
  for (const bad of [-1, '850', NaN, null]) {
    c.devices[0].caudal = { modo: 'manual', nominal: bad };
    assert.ok(validateConfig(c).some(m => m.includes('caudal.nominal')), String(bad));
  }
});
