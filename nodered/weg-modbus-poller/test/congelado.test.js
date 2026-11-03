'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFreezeDetector } = require('../src/congelado');

const regs = (seg) => { const r = new Array(70).fill(0); r[42] = seg & 0xffff; r[43] = seg >>> 16; return r; };

test('un contador de segundos energizados que avanza no es dato congelado', () => {
  const c = createFreezeDetector(180000);
  for (let t = 0; t <= 600000; t += 2000) assert.equal(c('SAER 5', regs(25336760 + t / 1000), t), false);
});

test('el mismo contador por 3 min (PLC que no refresca) es dato congelado, y se recupera al cambiar', () => {
  const c = createFreezeDetector(180000);
  assert.equal(c('SAER 5', regs(25336760), 0), false);
  assert.equal(c('SAER 5', regs(25336760), 179000), false);
  assert.equal(c('SAER 5', regs(25336760), 180000), true);
  assert.equal(c('SAER 6', regs(25336760), 180000), false); // cada equipo por separado
  assert.equal(c('SAER 5', regs(25336761), 182000), false);
});
