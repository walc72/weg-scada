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
process.env.SUPERADMIN_USER = 'super';
process.env.SUPERADMIN_PASSWORD = 'super-pass';

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

test('routes: GET public, PUT needs superadmin, body up to 2 MB', async () => {
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
    assert.equal((await put(await tokenFor('admin', 'admin-pass'), { name: 'X' })).status, 403);

    const admin = await tokenFor('super', 'super-pass');
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

test('footer: por defecto Tecno Electric, se cambia, vacío lo oculta, se valida el largo', () => {
  branding.reset();
  assert.equal(branding.get().footer, 'Tecno Electric S.A.');
  assert.equal(branding.set({ footer: '  Agriplus  ' }).footer, 'Agriplus');
  assert.equal(branding.set({ footer: '' }).footer, '');
  assert.throws(() => branding.set({ footer: 'x'.repeat(81) }), /máximo 80/);
  branding.reset();
});

test('colores: portal null y PDF naranja por defecto; se cambian, se validan, null vuelve al original', () => {
  branding.reset();
  assert.equal(branding.get().colorPortal, null);
  assert.equal(branding.get().colorInforme, '#E87722');
  const b = branding.set({ colorPortal: '#0A7F3F', colorInforme: '#123456' });
  assert.equal(b.colorPortal, '#0a7f3f');
  assert.equal(b.colorInforme, '#123456');
  assert.throws(() => branding.set({ colorPortal: 'red' }), /Color del portal inválido/);
  assert.throws(() => branding.set({ colorInforme: '#12345' }), /Color del informe inválido/);
  assert.equal(branding.set({ colorPortal: null }).colorPortal, null);
  assert.equal(branding.set({ colorInforme: '' }).colorInforme, '#E87722');
  branding.set({ colorPortal: '#111111' });
  assert.equal(branding.reset().colorPortal, null);
});

test('favicon: se guarda, se valida, reset lo borra', () => {
  branding.reset();
  const d = branding.get();
  assert.equal(d.customFavicon, false);
  assert.match(d.faviconUrl, /^\/api\/branding\/favicon\?v=\d+$/);
  assert.equal(branding.faviconPath().endsWith('favicon-default.png'), true);
  assert.equal(branding.set({ favicon: 'data:image/png;base64,' + PNG.toString('base64') }).customFavicon, true);
  assert.equal(path.basename(branding.faviconPath()), 'branding-favicon.png');
  branding.set({ favicon: JPG.toString('base64') });
  assert.equal(fs.existsSync(path.join(DIR, 'branding-favicon.png')), false);
  assert.throws(() => branding.set({ favicon: Buffer.from('GIF89a' + 'x'.repeat(30)).toString('base64') }), /Formato no soportado/);
  const big = Buffer.concat([PNG, Buffer.alloc(256 * 1024)]);
  assert.throws(() => branding.set({ favicon: big.toString('base64') }), /supera 256 KB/);
  assert.equal(branding.reset().customFavicon, false);
  assert.equal(fs.existsSync(path.join(DIR, 'branding-favicon.jpg')), false);
});

test('routes: GET /favicon público (defecto y propio); PUT favicon por admin = 403', async () => {
  branding.reset();
  const app = express();
  app.use('/api/branding', brandingRoutes);
  app.use(express.json({ limit: '1mb' }));
  app.post('/api/login', login);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = async (user, password) => (await (await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }),
  })).json()).token;
  const put = (token, body) => fetch(`${base}/api/branding`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  try {
    const def = await fetch(`${base}/api/branding/favicon`);
    assert.equal(def.status, 200);
    assert.equal(def.headers.get('cache-control'), 'no-cache');
    assert.equal((await put(await tokenFor('admin', 'admin-pass'), { favicon: PNG.toString('base64') })).status, 403);
    assert.equal((await put(await tokenFor('super', 'super-pass'), { favicon: JPG.toString('base64') })).status, 200);
    const cus = await fetch(`${base}/api/branding/favicon`);
    assert.equal(cus.status, 200);
    assert.equal(cus.headers.get('content-type'), 'image/jpeg');
  } finally { await new Promise(r => server.close(r)); branding.reset(); }
});
