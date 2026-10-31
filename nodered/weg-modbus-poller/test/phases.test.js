'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { phaseRegs, consecutive } = require('../src/phases');

test('mapa PM8000 por defecto (total 3060): potencia, corriente, tensión y THD en fracción', () => {
  const p = phaseRegs({ power: 3060 });
  assert.deepStrictEqual(p.power, [3054, 3056, 3058]);
  assert.deepStrictEqual(p.current, [3000, 3002, 3004]);
  assert.deepStrictEqual(p.voltage, [3020, 3022, 3024]);
  assert.deepStrictEqual(p.thdI, [21300, 21302, 21304]);
  assert.strictEqual(p.thdScale, 100);
});

test('regs propios ganan (THD propio ya en %); incompletos no cuentan', () => {
  const p = phaseRegs({ power: 3060, currentA: 10, currentB: 12, currentC: 14, thdIA: 1, thdIB: 3 });
  assert.deepStrictEqual(p.current, [10, 12, 14]);
  assert.deepStrictEqual(p.thdI, [21300, 21302, 21304]);
  const q = phaseRegs({ power: 1000, thdIA: 1, thdIB: 3, thdIC: 5 });
  assert.deepStrictEqual(q.thdI, [1, 3, 5]);
  assert.strictEqual(q.thdScale, 1);
  assert.strictEqual(phaseRegs({ power: 3060, thdScale: 1 }).thdScale, 1);
});

test('otro mapa sin regs: nada por fase', () => {
  const p = phaseRegs({ power: 1000 });
  assert.deepStrictEqual([p.power, p.current, p.voltage, p.thdI], [null, null, null, null]);
});

test('consecutive', () => {
  assert.ok(consecutive([3000, 3002, 3004]));
  assert.ok(!consecutive([3000, 3004, 3008]));
});
