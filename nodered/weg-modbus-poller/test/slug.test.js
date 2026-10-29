'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { slug } = require('../src/slug');
const { slug: slugApi } = require('../../weg-api/src/services/slug');

const CASOS = [
  ['Tensión fuente', 'tension_fuente'],
  ['Ángulo', 'angulo'],
  ['Potencia (kW)', 'potencia_kw'],
  ['  FP  RG1 ', 'fp_rg1'],
  ['Ñandú-2', 'nandu_2'],
];

test('slug del poller', () => {
  for (const [entrada, esperado] of CASOS) assert.strictEqual(slug(entrada), esperado);
});

test('poller, API y portal dan lo mismo', async () => {
  const portal = (await import(pathToFileURL(path.resolve(__dirname, '../../../frontend-react/src/lib/slug.js')).href)).default;
  for (const [entrada] of CASOS) {
    assert.strictEqual(slugApi(entrada), slug(entrada));
    assert.strictEqual(portal(entrada), slug(entrada));
  }
});
