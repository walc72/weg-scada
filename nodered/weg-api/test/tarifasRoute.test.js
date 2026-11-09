'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createTarifasRouter } = require('../src/routes/tarifas');

async function serve(role) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tarifas-')), 'tarifas.json');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/tarifas', createTarifasRouter(file));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/tarifas`;
  return {
    file,
    get: () => fetch(base),
    put: body => fetch(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    close: () => new Promise(r => server.close(r)),
  };
}

const franja = tramos => ({ nombre: 'Punta', precioKwh: 331.93, tramos });
const body = franjas => ({
  moneda: 'Gs',
  tarifas: [{ id: 't-abcd1234', nombre: 'ANDE 412', versiones: [{
    desde: '2024-11-26', franjas, resto: { nombre: 'Fuera de punta', precioKwh: 144.83 }, potencia: null,
  }] }],
  asignacion: {},
});
const ok = () => body([franja([{ dias: [1, 2, 3, 4, 5, 6], desde: 18, hasta: 22 }])]);

test('operador lee', async () => {
  const s = await serve('operador');
  try {
    const r = await s.get();
    assert.equal(r.status, 200);
    assert.equal((await r.json()).moneda, 'Gs');
  } finally { await s.close(); }
});

test('operador no escribe', async () => {
  const s = await serve('operador');
  try { assert.equal((await s.put(ok())).status, 403); } finally { await s.close(); }
});

test('admin: franjas superpuestas -> 400', async () => {
  const s = await serve('admin');
  try {
    const t = { dias: [1], desde: 18, hasta: 22 };
    const r = await s.put(body([franja([t]), franja([t])]));
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /se superpone/);
  } finally { await s.close(); }
});

test('admin: PUT valido guarda', async () => {
  const s = await serve('admin');
  try {
    assert.equal((await s.put(ok())).status, 200);
    assert.equal(JSON.parse(fs.readFileSync(s.file, 'utf8')).tarifas[0].id, 't-abcd1234');
  } finally { await s.close(); }
});
