'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { linea, estadoMuestra, everyPara } = require('../src/services/estados');

const T0 = Date.parse('2026-11-01T00:00:00Z');
const M = 60e3;

test('motor: marcha/parada de las muestras; huecos sin datos; tramos unidos y resumen en horas', () => {
  const muestras = [0, 1, 2].map((i) => ({ t: T0 + i * M, running: 1 })).concat([{ t: T0 + 3 * M, running: 0 }]);
  const { tramos, resumen } = linea({ tipo: 'motor', muestras, alarmas: [], desde: T0, hasta: T0 + 6 * M, every: 60 });
  assert.deepEqual(tramos.map((x) => [x.estado, (x.hasta - x.desde) / M]), [['marcha', 3], ['parada', 1], ['sin_datos', 2]]);
  assert.equal(resumen.marcha, 0.05);
});

test('las alarmas mandan: sin comunicación por encima de falla, falla por encima de la muestra', () => {
  const muestras = [0, 1, 2, 3].map((i) => ({ t: T0 + i * M, running: 1 }));
  const alarmas = [
    { type: 'FALLA', start: T0 + M, end: T0 + 3 * M },
    { type: 'SIN_COMUNICACION', start: T0 + 2 * M, end: null },
  ];
  const { tramos } = linea({ tipo: 'motor', muestras, alarmas, desde: T0, hasta: T0 + 4 * M, every: 60, ahora: T0 + 10 * M });
  assert.deepEqual(tramos.map((x) => x.estado), ['marcha', 'falla', 'sin_com']);
});

test('reconectador: bloqueado > cerrado/abierto; el disparo es su falla', () => {
  assert.equal(estadoMuestra('reco', { estado: 1, bloqueo: 1 }), 'bloqueado');
  assert.equal(estadoMuestra('reco', { estado: 0 }), 'abierto');
  const { tramos } = linea({ tipo: 'reco', muestras: [{ t: T0, estado: 1 }], alarmas: [{ type: 'DISPARO', start: T0 + M, end: T0 + 2 * M }], desde: T0, hasta: T0 + 2 * M, every: 60 });
  assert.deepEqual(tramos.map((x) => x.estado), ['cerrado', 'disparo']);
  assert.equal(estadoMuestra('reg', { auto: 0 }), 'manual');
});

test('resolución según el período', () => {
  assert.equal(everyPara(864e5), 60);
  assert.equal(everyPara(7 * 864e5), 300);
  assert.equal(everyPara(30 * 864e5), 900);
});

test('generador: carga > marcha > automático/parado; sus alarmas son falla', () => {
  assert.equal(estadoMuestra('gen', { rpm: 1500, kw: 80 }), 'carga');
  assert.equal(estadoMuestra('gen', { rpm: 1500, kw: 0.2 }), 'marcha');
  assert.equal(estadoMuestra('gen', { rpm: 0, modo: 1 }), 'auto');
  assert.equal(estadoMuestra('gen', { rpm: 0, modo: 0 }), 'parada');
  assert.equal(estadoMuestra('gen', {}), null);
  const muestras = [0, 1].map((i) => ({ t: T0 + i * M, rpm: 1500, kw: 50 }));
  const { tramos } = linea({ tipo: 'gen', muestras, alarmas: [{ type: 'ALARMA_30', start: T0 + M, end: T0 + 2 * M }], desde: T0, hasta: T0 + 2 * M, every: 60 });
  assert.deepEqual(tramos.map((x) => x.estado), ['carga', 'falla']);
});
