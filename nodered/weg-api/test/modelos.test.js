'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MODELOS, modeloId } = require('../src/services/modelos');
const { validateCampo } = require('../src/services/validate');

test('ids esperados', () => {
  assert.deepEqual(Object.keys(MODELOS).sort(), ['otro-reco', 'otro-reg', 'pmsetu', 'tapelectro', 'tsea']);
});

test('cada mapa pasa validateCampo', () => {
  for (const [id, m] of Object.entries(MODELOS)) {
    const errors = [];
    validateCampo({ name: 'X', modelo: id.startsWith('otro') ? 'otro' : id, ip: '10.0.0.1', mapa: m.mapa }, 0, m.kind, errors);
    assert.deepEqual(errors, [], id);
  }
});

test('descripciones piden verificar direcciones', () => {
  for (const m of Object.values(MODELOS)) assert.match(m.descripcion, /direcciones a verificar en puesta en marcha/);
});

test('tsea y tapelectro: tabla de la spec 5.6', () => {
  const esperado = [
    { key: 'tap', fc: 3, addr: 0, tipo: 's16' },
    { key: 'v', fc: 3, addr: 1, tipo: 'u16', escala: 0.1 },
    { key: 'i', fc: 3, addr: 2, tipo: 'u16', escala: 0.1 },
    { key: 'vConsigna', fc: 3, addr: 3, tipo: 'u16', escala: 0.1 },
    { key: 'auto', fc: 3, addr: 4, tipo: 'u16', bit: 0 },
    { key: 'remoto', fc: 3, addr: 4, tipo: 'u16', bit: 1 },
    { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 0, texto: 'Tap en límite' },
    { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 1, texto: 'Falla de control' },
  ];
  assert.deepEqual(MODELOS.tsea.mapa, esperado);
  assert.deepEqual(MODELOS.tapelectro.mapa, esperado);
});

test('otros y modeloId', () => {
  assert.deepEqual(MODELOS['otro-reco'].mapa, [{ key: 'estado', fc: 3, addr: 0, tipo: 'u16', bit: 0 }]);
  assert.deepEqual(MODELOS['otro-reg'].mapa, [{ key: 'tap', fc: 3, addr: 0, tipo: 's16' }]);
  assert.equal(modeloId('reg', 'otro'), 'otro-reg');
  assert.equal(modeloId('reco', 'otro'), 'otro-reco');
  assert.equal(modeloId('reco', 'pmsetu'), 'pmsetu');
});
