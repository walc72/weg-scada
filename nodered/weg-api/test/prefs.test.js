'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'prefs-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';
process.env.OPERADOR_USER = 'OPERADOR';
process.env.OPERADOR_PASSWORD = 'op-pass';
process.env.SUPERADMIN_USER = 'super';
process.env.SUPERADMIN_PASSWORD = 'super-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const prefs = require('../src/services/prefs');
const prefsRoutes = require('../src/routes/prefs');
const { login, requireAuth } = require('../src/middleware/auth');

const LAYOUT = { v: 1, items: [{ id: 'a', tipo: 'kpis', ancho: 12 }] };
const VACIO = { dashboard: null, misGraficos: null, defecto: { dashboard: null } };
const reset = () => fs.rmSync(prefs.PREFS_PATH, { force: true });

test('getDe de un usuario sin datos', () => {
  reset();
  assert.deepEqual(prefs.getDe('nadie'), VACIO);
});

test('prefs.json con basura → vacío sin lanzar', () => {
  fs.writeFileSync(prefs.PREFS_PATH, '{{no es json');
  assert.deepEqual(prefs.getDe('x'), VACIO);
  fs.writeFileSync(prefs.PREFS_PATH, '[1]');
  assert.deepEqual(prefs.getDe('x'), VACIO);
});

test('renombrar y borrarUsuario', () => {
  reset();
  prefs.set('operador', 'dashboard', LAYOUT);
  prefs.renombrar('Operador', 'Op2');
  assert.equal(prefs.getDe('operador').dashboard, null);
  assert.deepEqual(prefs.getDe('op2').dashboard, LAYOUT);
  prefs.borrarUsuario('OP2');
  assert.equal(prefs.getDe('op2').dashboard, null);
});

test('validaciones del servicio', () => {
  const it = (o) => ({ v: 1, items: [{ id: 'a', tipo: 'k', ancho: 6, ...o }] });
  assert.throws(() => prefs.set('u', 'otra', {}), /Clave de preferencia inválida/);
  assert.throws(() => prefs.validarDashboard(it({ ancho: 5 })), /ancho/);
  assert.throws(() => prefs.validarDashboard({ v: 2, items: [] }), /versión/);
  assert.throws(() => prefs.validarDashboard({ v: 1, items: Array.from({ length: 31 }, (_, i) => ({ id: 'i' + i, tipo: 'k', ancho: 4 })) }), /30/);
  assert.throws(() => prefs.validarDashboard(it({ id: 'x'.repeat(41) })), /id/);
  assert.throws(() => prefs.validarDashboard(it({ opciones: [] })), /opciones/);
  assert.doesNotThrow(() => prefs.validarDashboard(it({ opciones: { a: 1 } })));
  assert.throws(() => prefs.validarMisGraficos(Array.from({ length: 51 }, () => ({ trazas: [] }))), /50/);
  assert.throws(() => prefs.validarMisGraficos([{ trazas: Array.from({ length: 13 }, () => ({})) }]), /12/);
  assert.throws(() => prefs.validarMisGraficos('x'), /lista/);
  assert.throws(() => prefs.set('u', 'dashboard', { v: 1, items: [{ id: 'a', tipo: 'k', ancho: 4, opciones: { x: 'y'.repeat(70000) } }] }), /grande/);
});

test('rutas /api/prefs', async () => {
  reset();
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.post('/api/login', login);
  app.use(requireAuth);
  app.use('/api/prefs', prefsRoutes);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokenFor = async (user, password) => (await (await fetch(`${base}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }),
  })).json()).token;
  const call = (token, method, p, body) => fetch(`${base}/prefs${p}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const op = await tokenFor('OPERADOR', 'op-pass');
    const admin = await tokenFor('admin', 'admin-pass');
    assert.equal((await fetch(`${base}/prefs`)).status, 401);

    assert.equal((await call(op, 'PUT', '/dashboard', LAYOUT)).status, 200);
    assert.deepEqual((await (await call(op, 'GET', '')).json()).dashboard, LAYOUT);
    assert.deepEqual(prefs.getDe('OPERADOR').dashboard, LAYOUT);
    assert.equal((await call(admin, 'GET', '')).status, 200);
    assert.equal((await (await call(admin, 'GET', '')).json()).dashboard, null);

    assert.equal((await call(op, 'PUT', '/otra', LAYOUT)).status, 400);
    assert.equal((await call(op, 'PUT', '/dashboard', { v: 1, items: [{ id: 'a', tipo: 'k', ancho: 5 }] })).status, 400);
    assert.equal((await call(op, 'PUT', '/dashboard', { v: 2, items: [] })).status, 400);
    assert.equal((await call(op, 'PUT', '/dashboard', { v: 1, items: Array.from({ length: 31 }, (_, i) => ({ id: 'i' + i, tipo: 'k', ancho: 4 })) })).status, 400);
    assert.equal((await call(op, 'PUT', '/misGraficos', Array.from({ length: 51 }, () => ({ trazas: [] })))).status, 400);
    assert.equal((await call(op, 'PUT', '/misGraficos', [{ id: 'g', titulo: 'T', trazas: [] }])).status, 200);

    assert.equal((await call(op, 'PUT', '/defecto/dashboard', LAYOUT)).status, 403);
    assert.equal((await call(admin, 'PUT', '/defecto/dashboard', LAYOUT)).status, 200);
    assert.deepEqual((await (await call(op, 'GET', '')).json()).defecto.dashboard, LAYOUT);
    assert.equal((await call(op, 'DELETE', '/defecto/dashboard')).status, 403);
    assert.equal((await call(admin, 'DELETE', '/defecto/dashboard')).status, 200);
    assert.equal((await (await call(op, 'GET', '')).json()).defecto.dashboard, null);

    assert.equal((await call(op, 'DELETE', '/dashboard')).status, 200);
    assert.equal((await (await call(op, 'GET', '')).json()).dashboard, null);
    assert.equal((await call(op, 'DELETE', '/otra')).status, 400);
  } finally { server.close(); }
});
