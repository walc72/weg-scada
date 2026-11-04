'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { armar, SERIE_MIN } = require('../src/services/tarjetas');

const M = 60e3;
const ahora = Date.UTC(2026, 10, 4, 12, 0, 30);
const desde = ahora - 864e5 - 30e3;   // ranuras alineadas al minuto
const muestras = (desdeMin, hastaMin, running) =>
  Array.from({ length: hastaMin - desdeMin }, (_, i) => ({ t: desde + (desdeMin + i) * M, running }))

test('marcha desde el último cambio; la ranura en curso sin muestra no cuenta', () => {
  const total = Math.floor((ahora - desde) / M);       // ranuras completas
  const run = new Map([['P1', [...muestras(0, total - 90, 0), ...muestras(total - 90, total, 1)]]]);
  const out = armar({ devs: [{ name: 'P1' }], run, cur: new Map(), alarmas: [], desde, ahora });
  assert.equal(out.P1.estado, 'marcha');
  assert.equal(out.P1.desde, desde + (total - 90) * M);
  assert.equal(out.P1.mas24h, false);
  assert.equal(out.P1.corriente.length, SERIE_MIN);
});

test('sin parar en toda la ventana: mas24h', () => {
  const total = Math.floor((ahora - desde) / M);
  const out = armar({ devs: [{ name: 'P2' }], run: new Map([['P2', muestras(0, total, 0)]]), cur: new Map(), alarmas: [], desde, ahora });
  assert.equal(out.P2.estado, 'parada');
  assert.equal(out.P2.mas24h, true);
});

test('sin comunicación toma el inicio real de la alarma abierta (aunque pase las 24 h)', () => {
  const inicio = ahora - 3 * 864e5;
  const alarmas = [{ device: 'P3', type: 'SIN_COMUNICACION', start: inicio, end: null }];
  const out = armar({ devs: [{ name: 'P3' }], run: new Map(), cur: new Map(), alarmas, desde, ahora });
  assert.equal(out.P3.estado, 'sin_com');
  assert.equal(out.P3.desde, inicio);
  assert.equal(out.P3.mas24h, false);
});

test('corriente: un valor por minuto de la última hora, null donde falta', () => {
  const min0 = Math.floor(ahora / M) * M - (SERIE_MIN - 1) * M;
  const cur = new Map([['P4', new Map([[min0, 10], [min0 + (SERIE_MIN - 1) * M, 20]])]]);
  const out = armar({ devs: [{ name: 'P4' }], run: new Map(), cur, alarmas: [], desde, ahora });
  assert.equal(out.P4.corriente[0], 10);
  assert.equal(out.P4.corriente[SERIE_MIN - 1], 20);
  assert.equal(out.P4.corriente[1], null);
});
