'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { phaseRegs, consecutive } = require('../src/phases');

test('mapa PM8000 por defecto (total 3060): potencia, corriente y tensión; sin THD', () => {
  const p = phaseRegs({ power: 3060 });
  assert.deepStrictEqual(p.power, [3054, 3056, 3058]);
  assert.deepStrictEqual(p.current, [3000, 3002, 3004]);
  assert.deepStrictEqual(p.voltage, [3020, 3022, 3024]);
  assert.strictEqual(p.thdI, null);
});

test('regs propios ganan; incompletos no cuentan', () => {
  const p = phaseRegs({ power: 3060, currentA: 10, currentB: 12, currentC: 14, thdIA: 1, thdIB: 3 });
  assert.deepStrictEqual(p.current, [10, 12, 14]);
  assert.strictEqual(p.thdI, null);
});

test('otro mapa sin regs: nada por fase', () => {
  const p = phaseRegs({ power: 1000 });
  assert.deepStrictEqual(p, { power: null, current: null, voltage: null, thdI: null });
});

test('consecutive', () => {
  assert.ok(consecutive([3000, 3002, 3004]));
  assert.ok(!consecutive([3000, 3004, 3008]));
});
