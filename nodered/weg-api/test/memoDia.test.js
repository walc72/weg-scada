'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _memoDia: memo } = require('../src/services/reports');

test('memoDia: pedidos simultáneos comparten el cálculo, copia por pedido, vence a los 55 s', async () => {
  let n = 0;
  const calc = () => { n++; return Promise.resolve({ drives: [{ kwhHora: [1] }] }); };
  const [a, b] = await Promise.all([memo('d|x', calc, 1000), memo('d|x', calc, 1000)]);
  assert.equal(n, 1);
  delete a.drives[0].kwhHora;                       // tarifas.aplicar() borra esto
  assert.deepEqual(b.drives[0].kwhHora, [1]);
  assert.deepEqual((await memo('d|x', calc, 50000)).drives[0].kwhHora, [1]);
  assert.equal(n, 1);
  await memo('d|x', calc, 1000 + 55000);
  assert.equal(n, 2);
});

test('memoDia: un error no queda guardado', async () => {
  let n = 0;
  const calc = () => (++n === 1 ? Promise.reject(new Error('influx')) : Promise.resolve({ ok: 1 }));
  await assert.rejects(memo('e|x', calc, 1000), /influx/);
  assert.deepEqual(await memo('e|x', calc, 1001), { ok: 1 });
  assert.equal(n, 2);
});
