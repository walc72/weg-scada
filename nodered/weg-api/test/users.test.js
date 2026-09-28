'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'users-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';
process.env.OPERADOR_USER = 'operador';
process.env.OPERADOR_PASSWORD = 'op-pass';
delete process.env.SUPERADMIN_USER;
delete process.env.SUPERADMIN_PASSWORD;
delete process.env.SUPERADMIN_PASSWORD_HASH;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const settings = require('../src/services/settings');
const settingsRoutes = require('../src/routes/settings');
const { requireAuth, login } = require('../src/middleware/auth');

const reset = () => { try { fs.unlinkSync(settings.SETTINGS_PATH); } catch { /* no existe */ } };
const SA = { user: 'super', role: 'superadmin' };
const AD = { user: 'admin', role: 'admin' };

test('bootstrap from .env: superadmin listed without password until configured', () => {
  reset();
  assert.deepEqual(settings.listUsers(), [
    { user: 'superadmin', role: 'superadmin', hasPassword: false },
    { user: 'admin', role: 'admin', hasPassword: true },
    { user: 'operador', role: 'operador', hasPassword: true },
  ]);
  assert.deepEqual(settings.getUsersFull().map(u => u.role), ['admin', 'operador']);
  settings.setSuperadmin('super', 'super-pass');
  assert.deepEqual(settings.listUsers()[0], { user: 'super', role: 'superadmin', hasPassword: true });
});

test('legacy settings (one entry per role, maybe without user) still work', () => {
  reset();
  fs.writeFileSync(settings.SETTINGS_PATH, JSON.stringify({ users: [{ role: 'admin', hash: settings.hashPassword('nueva') }, { role: 'operador', user: 'turno' }] }));
  const full = settings.getUsersFull();
  assert.deepEqual(full.map(u => [u.user, u.role]), [['admin', 'admin'], ['turno', 'operador']]);
  assert.equal(full[1].plain, 'op-pass'); // sin hash → la contraseña del .env de su rol
});

test('create / update / delete with the protection rules', () => {
  reset();
  settings.setSuperadmin('super', 'super-pass');
  settings.createUser(AD, { user: 'juan', role: 'operador', password: 'clave1' });
  assert.throws(() => settings.createUser(AD, { user: 'JUAN', role: 'operador', password: 'clave1' }), /Ya existe/);
  assert.throws(() => settings.createUser(AD, { user: 'otro', role: 'superadmin', password: 'clave1' }), /Rol inválido/);
  assert.throws(() => settings.createUser(AD, { user: 'otro', role: 'admin', password: '12' }), /al menos 4/);
  assert.throws(() => settings.createUser(AD, { user: 'con espacio', role: 'admin', password: 'clave1' }), /Usuario inválido/);

  // superadmin: solo él lo modifica; nunca se elimina ni cambia de rol
  assert.throws(() => settings.updateUser(AD, 'super', { password: 'x1234' }), (e) => e.status === 403);
  assert.throws(() => settings.deleteUser(AD, 'super'), (e) => e.status === 403);
  assert.throws(() => settings.deleteUser(SA, 'super'), (e) => e.status === 403);
  assert.throws(() => settings.updateUser(SA, 'super', { role: 'admin' }), /no cambia de rol/);
  settings.updateUser(SA, 'super', { user: 'root', password: 'otra-clave' });
  assert.equal(settings.findUser('root').role, 'superadmin');

  // nadie se elimina ni se cambia el rol a sí mismo
  assert.throws(() => settings.deleteUser(AD, 'admin'), /propio usuario/);
  assert.throws(() => settings.updateUser(AD, 'admin', { role: 'operador' }), /propio rol/);

  const r = settings.updateUser(AD, 'juan', { role: 'admin' });
  assert.deepEqual([r.before.role, r.after.role, r.passwordChanged], ['operador', 'admin', false]);
  settings.deleteUser(AD, 'juan');
  assert.equal(settings.findUser('juan'), null);

  // una vez guardada la lista, el .env ya no resucita usuarios borrados
  settings.deleteUser(SA, 'operador');
  assert.equal(settings.getUsersFull().some(u => u.role === 'operador'), false);
  // y las contraseñas quedan hasheadas (nunca texto plano en settings.json)
  const saved = JSON.parse(fs.readFileSync(settings.SETTINGS_PATH, 'utf8'));
  assert.equal(JSON.stringify(saved).includes('admin-pass'), false);
  assert.ok(saved.users.every(u => /^scrypt\$/.test(u.hash)));
});

test('routes: admin manages users, sessions of edited users are closed', async () => {
  reset();
  settings.setSuperadmin('super', 'super-pass');
  const app = express();
  app.use(express.json());
  app.post('/api/login', login);
  app.use(requireAuth);
  app.get('/api/ping', (req, res) => res.json({ user: req.auth.user, role: req.auth.role }));
  app.use('/api/settings', settingsRoutes);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (token, method, p, body) => fetch(base + p, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  });
  const tokenFor = async (user, password) => (await (await fetch(`${base}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }),
  })).json()).token;
  try {
    const op = await tokenFor('operador', 'op-pass');
    assert.equal((await call(op, 'GET', '/settings/users')).status, 403);

    const admin = await tokenFor('admin', 'admin-pass');
    const cr = await call(admin, 'POST', '/settings/users', { user: 'maria', role: 'operador', password: 'clave-m' });
    assert.equal(cr.status, 200);
    const body = await cr.json();
    assert.equal(body.me, 'admin');
    assert.ok(body.users.some(u => u.user === 'maria' && u.role === 'operador'));
    assert.equal(JSON.stringify(body).includes('scrypt'), false);

    const maria = await tokenFor('maria', 'clave-m');
    assert.equal((await call(maria, 'GET', '/ping')).status, 200);
    // cambiarle el rol cierra su sesión
    assert.equal((await call(admin, 'PUT', '/settings/users/maria', { role: 'admin' })).status, 200);
    assert.equal((await call(maria, 'GET', '/ping')).status, 401);

    assert.equal((await call(admin, 'PUT', '/settings/users/super', { password: 'hack1' })).status, 403);
    assert.equal((await call(admin, 'DELETE', '/settings/users/super')).status, 403);
    assert.equal((await call(admin, 'DELETE', '/settings/users/nadie')).status, 404);

    // renombrarse a sí mismo mantiene la sesión con el nombre nuevo
    assert.equal((await call(admin, 'PUT', '/settings/users/admin', { user: 'jefe' })).status, 200);
    assert.deepEqual(await (await call(admin, 'GET', '/ping')).json(), { user: 'jefe', role: 'admin' });

    const m2 = await tokenFor('maria', 'clave-m');
    assert.equal((await call(admin, 'DELETE', '/settings/users/maria')).status, 200);
    assert.equal((await call(m2, 'GET', '/ping')).status, 401);
  } finally { await new Promise(r => server.close(r)); }
});
