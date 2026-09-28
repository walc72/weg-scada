'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CONFIG_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loginlim-')), 'config.json');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';
process.env.OPERADOR_USER = 'operador';
process.env.OPERADOR_PASSWORD = 'op-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const { login } = require('../src/middleware/auth');

// En la VM todos llegan con la misma IP (gateway de Docker / SNAT de Tailscale):
// el límite de intentos no puede dejar sin login a todos por culpa de uno.
function tryLogin(user, password, ip = '172.18.0.1') {
  let status = 200;
  let body = null;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  login({ headers: { 'x-real-ip': ip }, socket: {}, body: { user, password } }, res);
  return { status, body };
}

test('10 bad passwords for one user lock that user, not the others on the same IP', () => {
  for (let i = 0; i < 10; i++) assert.equal(tryLogin('admin', 'mal').status, 401);
  assert.equal(tryLogin('admin', 'mal').status, 429);
  assert.equal(tryLogin('admin', 'admin-pass').status, 429, 'el usuario atacado queda bloqueado aunque acierte');
  assert.equal(tryLogin('operador', 'op-pass').status, 200, 'otro usuario desde la misma IP entra');
});

test('the lock is per user name regardless of case', () => {
  for (let i = 0; i < 10; i++) tryLogin('Operador', 'mal', '10.9.9.9');
  assert.equal(tryLogin('OPERADOR', 'op-pass', '10.9.9.9').status, 429);
});

test('spraying many user names from one IP is still capped', () => {
  let last = null;
  for (let i = 0; i < 60; i++) last = tryLogin(`u${i}`, 'mal', '10.7.7.7');
  assert.equal(last.status, 429);
});
