'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aCSV } = require('../src/services/exportar');
const { zip } = require('../src/services/zip');

test('aCSV: BOM, coma decimal, comillas, fecha local y nulos', () => {
  const out = aCSV(['A', 'B'], [[12.5, null], [0, 'x;y'], ['di"jo', new Date(2026, 10, 10, 8, 5)]]);
  assert.equal(out, '﻿A;B\r\n12,5;\r\n0;"x;y"\r\n"di""jo";10/11/2026 08:05');
  assert.equal(aCSV(['A'], [[NaN], [Infinity], ['1.5']]), '﻿A\r\n\r\n\r\n1.5');
});

test('zip: arma un ZIP con el nombre del archivo', () => {
  const z = zip({ 'a.csv': 'hola' });
  assert.equal(z.subarray(0, 2).toString(), 'PK');
  assert.ok(z.includes('a.csv'));
});
