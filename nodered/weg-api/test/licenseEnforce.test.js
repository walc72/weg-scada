'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const configService = require('../src/services/config');
const configRoutes = require('../src/routes/config');
const requireModule = require('../src/middleware/requireModule');

const dev = (name, extra = {}) => ({ name, type: 'CFW900', ip: '10.0.0.1', ...extra });
const meter = (name) => ({ name, type: 'PM', ip: '10.0.0.2' });

async function serve(stored, lic) {
  const saved = [];
  const orig = { get: configService.get, save: configService.save };
  configService.get = () => JSON.parse(JSON.stringify(stored));
  configService.save = (c) => { saved.push(c); return true; };
  configRoutes.setLicenseGetter(() => lic);
  const app = express();
  app.use(express.json());
  app.use('/api/config', configRoutes);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/config`;
  return {
    saved,
    send: (method, p, body) => fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    close: () => new Promise((r) => { Object.assign(configService, orig); server.close(r); }),
  };
}

test('PUT / con 3 variadores y límite B 2 → 400; con 2 → 200', async () => {
  const s = await serve({ devices: [] }, { modulos: [], limites: { A: 0, B: 2, C: 0 } });
  try {
    const r = await s.send('PUT', '/', { devices: [dev('a'), dev('b'), dev('c')] });
    assert.equal(r.status, 400);
    assert.deepEqual((await r.json()).details, ['Límite de la licencia: nivel B 3/2']);
    assert.equal((await s.send('PUT', '/', { devices: [dev('a'), dev('b')] })).status, 200);
  } finally { await s.close(); }
});

test('POST /devices que llevaría a B 3/2 → 400', async () => {
  const s = await serve({ devices: [dev('a'), dev('b')] }, { modulos: [], limites: { A: 0, B: 2, C: 0 } });
  try {
    assert.equal((await s.send('POST', '/devices', dev('c'))).status, 400);
    assert.equal(s.saved.length, 0);
  } finally { await s.close(); }
});

test('PUT /devices por encima del límite → 400', async () => {
  const s = await serve({ devices: [dev('a')] }, { modulos: [], limites: { A: 0, B: 1, C: 0 } });
  try {
    assert.equal((await s.send('PUT', '/devices', [dev('a'), dev('b')])).status, 400);
    assert.equal((await s.send('PUT', '/devices', [dev('a')])).status, 200);
  } finally { await s.close(); }
});

test('PUT / agregando un medidor sin módulo medidores → 400; con módulo → 200', async () => {
  const body = { devices: [], meters: [meter('m1')] };
  let s = await serve({ devices: [] }, { modulos: [], limites: { A: 0, B: 2, C: 2 } });
  try { assert.equal((await s.send('PUT', '/', body)).status, 400); } finally { await s.close(); }
  s = await serve({ devices: [] }, { modulos: ['medidores'], limites: { A: 0, B: 2, C: 2 } });
  try { assert.equal((await s.send('PUT', '/', body)).status, 200); } finally { await s.close(); }
});

test('config ya excedida (licencia bajada) + PUT que no agrega equipos → 200', async () => {
  const over = [dev('a'), dev('b'), dev('c')];
  const s = await serve({ devices: over }, { modulos: [], limites: { A: 0, B: 2, C: 0 } });
  try {
    assert.equal((await s.send('PUT', '/', { devices: over, pollIntervalMs: 2000 })).status, 200);
    assert.equal((await s.send('POST', '/devices', dev('d'))).status, 400);
  } finally { await s.close(); }
});

test('sin getter la licencia es BASE (B 2)', async () => {
  const s = await serve({ devices: [] }, undefined);
  configRoutes.setLicenseGetter(null);
  try { assert.equal((await s.send('PUT', '/', { devices: [dev('a'), dev('b'), dev('c')] })).status, 400); } finally { await s.close(); }
});

test('requireModule: 403 sin módulo, pasa con módulo', async () => {
  let lic = { modulos: [] };
  const app = express();
  app.use('/api/waveform', requireModule(() => lic, 'medidores'), (req, res) => res.send('ok'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/waveform/X`;
  try {
    const r = await fetch(url);
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { error: 'La licencia no incluye el módulo medidores' });
    lic = { modulos: ['medidores'] };
    assert.equal((await fetch(url)).status, 200);
  } finally { await new Promise((r) => server.close(r)); }
});
