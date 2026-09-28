'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';
process.env.OPERADOR_USER = 'operador';
process.env.OPERADOR_PASSWORD = 'op-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const branding = require('../src/services/branding');
const brandingRoutes = require('../src/routes/branding');
const { login } = require('../src/middleware/auth');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);

test('defaults when nothing configured', () => {
  branding.reset();
  const b = branding.get();
  assert.equal(b.name, 'Planta de Bombeo');
  assert.equal(b.subtitle, 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.');
  assert.equal(b.customLogo, false);
  assert.match(b.logoUrl, /^\/api\/branding\/logo\?v=\d+$/);
  assert.equal(branding.logoPath(), branding.DEFAULT_LOGO);
});

test('sets name and subtitle; rejects empty name and too long text', () => {
  branding.reset();
  assert.equal(branding.set({ name: '  Demo Tecno  ', subtitle: '' }).name, 'Demo Tecno');
  assert.equal(branding.get().subtitle, '');
  assert.throws(() => branding.set({ name: '   ' }), /no puede quedar vacío/);
  assert.throws(() => branding.set({ name: 'x'.repeat(61) }), /máximo 60/);
  assert.throws(() => branding.set({ subtitle: 'x'.repeat(201) }), /máximo 200/);
});

test('accepts PNG (data URL) and then JPG, removing the previous file', () => {
  branding.reset();
  branding.set({ logo: 'data:image/png;base64,' + PNG.toString('base64') });
  assert.equal(path.basename(branding.logoPath()), 'branding-logo.png');
  assert.equal(branding.get().customLogo, true);
  branding.set({ logo: JPG.toString('base64') });
  assert.equal(path.basename(branding.logoPath()), 'branding-logo.jpg');
  assert.equal(fs.existsSync(path.join(DIR, 'branding-logo.png')), false);
});

test('rejects non-image bytes even if declared as png', () => {
  const gif = Buffer.from('GIF89a' + 'x'.repeat(30));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.throws(() => branding.set({ logo: 'data:image/png;base64,' + gif.toString('base64') }), /Formato no soportado \(solo PNG o JPG\)/);
  assert.throws(() => branding.set({ logo: svg.toString('base64') }), /Formato no soportado/);
});

test('rejects logos over 1 MB', () => {
  const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
  assert.throws(() => branding.set({ logo: big.toString('base64') }), /supera 1 MB/);
});

test('reset restores defaults and deletes the logo file', () => {
  branding.set({ name: 'X', logo: PNG.toString('base64') });
  const b = branding.reset();
  assert.equal(b.name, 'Planta de Bombeo');
  assert.equal(b.customLogo, false);
  assert.equal(fs.existsSync(path.join(DIR, 'branding-logo.png')), false);
});

test('routes: GET public, PUT needs admin, body up to 2 MB', async () => {
  branding.reset();
  const app = express();
  app.use('/api/branding', brandingRoutes);          // antes del json global, como en server.js
  app.use(express.json({ limit: '1mb' }));
  app.post('/api/login', login);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = async (user, password) => (await (await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }),
  })).json()).token;
  const put = (token, body) => fetch(`${base}/api/branding`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await (await fetch(`${base}/api/branding`)).json()).name, 'Planta de Bombeo');
    const logo = await fetch(`${base}/api/branding/logo`);
    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get('content-type'), 'image/png');

    assert.equal((await put(null, { name: 'X' })).status, 401);
    assert.equal((await put(await tokenFor('operador', 'op-pass'), { name: 'X' })).status, 403);

    const admin = await tokenFor('admin', 'admin-pass');
    const nearlyMb = Buffer.concat([PNG, Buffer.alloc(1000 * 1024)]).toString('base64'); // ~1,37 MB de JSON
    const ok = await put(admin, { name: 'Demo', logo: nearlyMb });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).name, 'Demo');

    const bad = await put(admin, { name: '' });
    assert.equal(bad.status, 400);

    const del = await fetch(`${base}/api/branding`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
    assert.equal((await del.json()).name, 'Planta de Bombeo');
  } finally { await new Promise(r => server.close(r)); }
});
