'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createSerieRouter } = require('../src/routes/serie');

async function serve(role, opts) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: `u-${role}` }; next(); });
  app.use('/api/serie', createSerieRouter(opts));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/serie`;
  return { call: (m, p) => fetch(base + p, { method: m }), close: () => new Promise((r) => server.close(r)) };
}

test('GET proxya el diagnóstico del poller para cualquier rol', async () => {
  const pedidos = [];
  const s = await serve('operador', { pedir: async (m, ruta) => { pedidos.push([m, ruta]); return { status: 200, body: '[{"gateway":"PLC","disponible":true}]' }; } });
  const r = await s.call('GET', '/');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), [{ gateway: 'PLC', disponible: true }]);
  assert.deepEqual(pedidos, [['GET', '/serie']]);
  await s.close();
});

test('reiniciar: el operador no puede; el admin sí, con su usuario', async () => {
  const pedidos = [];
  const pedir = async (m, ruta, cuerpo) => { pedidos.push([m, ruta, cuerpo]); return { status: 200, body: '{"ok":true}' }; };
  const op = await serve('operador', { pedir });
  assert.equal((await op.call('POST', '/PLC%20M241/reiniciar')).status, 403);
  await op.close();
  assert.equal(pedidos.length, 0);

  const ad = await serve('admin', { pedir });
  const r = await ad.call('POST', '/PLC%20M241/reiniciar');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(pedidos, [['POST', '/serie/PLC%20M241/reiniciar', { usuario: 'u-admin' }]]);
  await ad.close();
});

test('en la réplica no se consulta al poller ni se reinicia', async () => {
  const pedir = async () => { throw new Error('no debería llamarse'); };
  const s = await serve('superadmin', { pedir, replica: true });
  assert.deepEqual(await (await s.call('GET', '/')).json(), []);
  assert.equal((await s.call('POST', '/PLC/reiniciar')).status, 403);
  await s.close();
});
