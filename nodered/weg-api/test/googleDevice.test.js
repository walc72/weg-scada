'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createBackupRouter } = require('../src/routes/backup');
const { createGoogle } = require('../src/services/googleDevice');
const { installationName } = require('../src/services/installationName');

// Google falso: respuestas de /token en cola, carpetas en memoria.
async function fakeGoogle() {
  const st = { tokenQueue: [], calls: [], folders: [], revoked: [], nextId: 1, deviceExpires: 1800 };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      st.calls.push(`${req.method} ${url.pathname}`);
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (url.pathname === '/device') {
        st.deviceBody = new URLSearchParams(raw);
        return send(200, { device_code: 'dev-1', user_code: 'ABCD-EFGH', verification_url: 'https://www.google.com/device', expires_in: st.deviceExpires, interval: 0 });
      }
      if (url.pathname === '/token') {
        st.tokenBody = new URLSearchParams(raw);
        const r = st.tokenQueue.shift() || { code: 428, body: { error: 'authorization_pending' } };
        return send(r.code, r.body);
      }
      if (url.pathname === '/revoke') { st.revoked.push(new URLSearchParams(raw).get('token')); return send(st.revokeFail ? 400 : 200, {}); }
      if (url.pathname === '/userinfo') return send(200, { email: 'admin@ejemplo.com' });
      if (url.pathname === '/files' && req.method === 'GET') {
        const q = url.searchParams.get('q');
        const m = /name='([^']*)'.*'([^']*)' in parents/.exec(q);
        return send(200, { files: st.folders.filter((f) => f.name === m[1] && f.parent === m[2]).map((f) => ({ id: f.id })) });
      }
      if (url.pathname === '/files' && req.method === 'POST') {
        const b = JSON.parse(raw);
        const f = { id: `fld-${st.nextId++}`, name: b.name, parent: (b.parents || ['root'])[0] };
        st.folders.push(f);
        return send(200, { id: f.id });
      }
      const g = /^\/files\/(.+)$/.exec(url.pathname);
      if (g) { const f = st.folders.find((x) => x.id === g[1]); return f ? send(200, { id: f.id }) : send(404, {}); }
      send(404, {});
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const api = createGoogle({ device: `${b}/device`, token: `${b}/token`, revoke: `${b}/revoke`, userinfo: `${b}/userinfo`, drive: `${b}/files` });
  return { st, api, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

async function serve(g, { google = {}, files = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-gd-'));
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: 'admin', user: 'a' }; next(); });
  app.use('/api/backup', createBackupRouter({ configDir: dir, getLicense: () => ({ modulos: ['backup'] }), slowDownMs: 0, google: { clientId: 'cid', clientSecret: 'csec', api: g.api, ...google } }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/backup`;
  const call = (method, p, body) => fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const estado = async () => (await call('GET', '/drive/conectar')).json();
  const esperar = async (fn) => {
    for (let i = 0; i < 100; i++) { const e = await estado(); if (fn(e)) return e; await new Promise((r) => setTimeout(r, 20)); }
    throw new Error('timeout: ' + JSON.stringify(await estado()));
  };
  return {
    dir, call, estado, esperar,
    json: (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')),
    mode: (n) => fs.statSync(path.join(dir, n)).mode & 0o777,
    has: (n) => fs.existsSync(path.join(dir, n)),
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); fs.rmSync(dir, { recursive: true, force: true }); }),
  };
}

const TOK = { code: 200, body: { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, token_type: 'Bearer' } };

test('flujo completo: pendiente -> slow_down -> conectado, escribe archivos y carpeta', async () => {
  const g = await fakeGoogle();
  const s = await serve(g, { files: { 'backup-secretos.json': JSON.stringify({ frase: 'una-frase-larga-1' }), 'backup.json': JSON.stringify({ modulo: true, drive: { activo: false } }) } });
  try {
    g.st.tokenQueue.push({ code: 428, body: { error: 'authorization_pending' } }, { code: 400, body: { error: 'slow_down' } }, TOK);
    const r = await s.call('POST', '/drive/conectar');
    assert.deepEqual(await r.json(), { userCode: 'ABCD-EFGH', verificationUrl: 'https://www.google.com/device' });
    assert.match(g.st.deviceBody.get('scope'), /drive\.file/);
    const e = await s.esperar((x) => x.estado === 'conectado');
    assert.equal(e.cuenta, 'admin@ejemplo.com');
    assert.equal(g.st.tokenBody.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
    assert.equal(g.st.tokenBody.get('client_secret'), 'csec');
    const tok = s.json('backup-drive-token.json');
    assert.equal(tok.refresh_token, 'rt-1');
    assert.equal(tok.token_type, 'Bearer');
    assert.equal(tok.access_token, 'at-1');
    assert.ok(Math.abs(new Date(tok.expiry) - (Date.now() + 3600e3)) < 60e3);
    assert.match(tok.expiry, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.equal(s.mode('backup-drive-token.json'), 0o600);
    assert.deepEqual(s.json('backup-secretos.json'), { frase: 'una-frase-larga-1', drive: { client_id: 'cid', client_secret: 'csec' } });
    assert.equal(s.mode('backup-secretos.json'), 0o600);
    const c = s.json('backup.json');
    assert.equal(c.drive.activo, false);
    assert.equal(c.drive.cuenta, 'admin@ejemplo.com');
    const raiz = g.st.folders.find((f) => f.name === 'WEG SCADA backups');
    const inst = g.st.folders.find((f) => f.name === 'sin-licencia-00000000');
    assert.equal(raiz.parent, 'root');
    assert.equal(inst.parent, raiz.id);
    assert.equal(c.drive.carpetaId, inst.id);
    assert.equal(c.drive.carpetaRaizId, raiz.id);
    assert.equal(c.modulo, true);
    const get = await (await s.call('GET', '/')).json();
    assert.equal(get.drive.conectado, true);
    assert.equal(get.drive.cuenta, 'admin@ejemplo.com');
  } finally { await s.close(); await g.close(); }
});

test('access_denied -> rechazado; expired_token -> vencido; no escribe nada', async () => {
  const g = await fakeGoogle();
  const s = await serve(g);
  try {
    g.st.tokenQueue.push({ code: 403, body: { error: 'access_denied' } });
    await s.call('POST', '/drive/conectar');
    await s.esperar((x) => x.estado === 'rechazado');
    g.st.tokenQueue.push({ code: 400, body: { error: 'expired_token' } });
    await s.call('POST', '/drive/conectar');
    await s.esperar((x) => x.estado === 'vencido');
    assert.ok(!s.has('backup-drive-token.json') && !s.has('backup-secretos.json') && !s.has('backup.json'));
  } finally { await s.close(); await g.close(); }
});

test('sin refresh_token no se conecta; vence por expires_in; un POST nuevo reemplaza al viejo', async () => {
  const g = await fakeGoogle();
  const s = await serve(g);
  try {
    g.st.tokenQueue.push({ code: 200, body: { access_token: 'x', expires_in: 10 } });
    await s.call('POST', '/drive/conectar');
    const e = await s.esperar((x) => x.estado === 'error');
    assert.match(e.error, /refresh_token/);
    assert.ok(!s.has('backup-drive-token.json'));

    g.st.deviceExpires = 0; // vence enseguida
    await s.call('POST', '/drive/conectar');
    await s.esperar((x) => x.estado === 'vencido');

    g.st.deviceExpires = 1800;
    await s.call('POST', '/drive/conectar');
    await s.call('POST', '/drive/conectar'); // reemplaza
    await new Promise((r) => setTimeout(r, 100)); // que termine el sondeo en vuelo del flujo viejo
    g.st.tokenQueue.push(TOK);
    await s.esperar((x) => x.estado === 'conectado');
  } finally { await s.close(); await g.close(); }
});

test('sin GOOGLE_CLIENT_ID: disponible false y conectar 503', async () => {
  const g = await fakeGoogle();
  const s = await serve(g, { google: { clientId: '', clientSecret: '' } });
  try {
    assert.equal((await (await s.call('GET', '/')).json()).drive.disponible, false);
    assert.equal((await s.call('POST', '/drive/conectar')).status, 503);
  } finally { await s.close(); await g.close(); }
});

test('reconectar reusa las carpetas existentes', async () => {
  const g = await fakeGoogle();
  const s = await serve(g);
  try {
    g.st.tokenQueue.push(TOK);
    await s.call('POST', '/drive/conectar');
    await s.esperar((x) => x.estado === 'conectado');
    await s.call('POST', '/drive/desconectar');
    g.st.tokenQueue.push(TOK);
    await s.call('POST', '/drive/conectar');
    await s.esperar((x) => x.estado === 'conectado');
    assert.equal(g.st.folders.length, 2);
    assert.equal(s.json('backup.json').drive.carpetaId, g.st.folders[1].id);
  } finally { await s.close(); await g.close(); }
});

test('desconectar revoca, borra token y secretos de drive, deja activo:false (aun si revoke falla)', async () => {
  const g = await fakeGoogle();
  const s = await serve(g);
  try {
    g.st.tokenQueue.push(TOK);
    await s.call('POST', '/drive/conectar');
    await s.esperar((x) => x.estado === 'conectado');
    await s.call('PUT', '/frase', { frase: 'una-frase-larga-1' });
    assert.equal((await s.call('PUT', '/', { drive: { activo: true } })).status, 200);
    g.st.revokeFail = true;
    const r = await s.call('POST', '/drive/desconectar');
    assert.equal(r.status, 200);
    assert.deepEqual(g.st.revoked, ['rt-1']);
    assert.ok(!s.has('backup-drive-token.json'));
    assert.deepEqual(s.json('backup-secretos.json'), { frase: 'una-frase-larga-1' });
    const c = s.json('backup.json').drive;
    assert.equal(c.activo, false);
    assert.equal(c.carpetaId, undefined);
    assert.equal(c.cuenta, undefined);
    assert.equal((await s.estado()).estado, 'ninguno');
  } finally { await s.close(); await g.close(); }
});

test('PUT drive.activo:true sin conectar -> 400', async () => {
  const g = await fakeGoogle();
  const s = await serve(g, { files: { 'backup-secretos.json': JSON.stringify({ frase: 'una-frase-larga-1' }) } });
  try {
    const r = await s.call('PUT', '/', { drive: { activo: true } });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'Conectá Google Drive antes de activarlo');
  } finally { await s.close(); await g.close(); }
});

test('installationName: mismos valores que las pruebas de weg-backup (lib.sh installation_id)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-inst-'));
  const b64u = (s) => Buffer.from(s).toString('base64url');
  const w = (n, c) => fs.writeFileSync(path.join(dir, n), c);
  try {
    assert.equal(installationName(dir), 'sin-licencia-00000000');
    w('install-id', '1A2B3C4D-5e6f-4000-8000-000000000000\n');
    assert.equal(installationName(dir), 'sin-licencia-1a2b3c4d');
    w('license.key', `${b64u('{"v":1,"cliente":"Agro Plus S.A.","installId":"1A2B3C4D-5e6f-4000-8000-000000000000"}')}.${b64u('firma')}\n`);
    assert.equal(installationName(dir), 'agro-plus-s-a-1a2b3c4d');
    w('license.key', `${b64u('{"v":1,"cliente":"Otro","installId":"99999999-0000-0000-0000-000000000000"}')}.${b64u('firma')}\n`);
    assert.equal(installationName(dir), 'sin-licencia-1a2b3c4d');
    w('license.key', 'basura\n');
    assert.equal(installationName(dir), 'sin-licencia-1a2b3c4d');
    w('license.key', `${b64u('{"v":1,"cliente":"  Ñandú -- SA ","installId":"1a2b3c4d-5e6f-4000-8000-000000000000"}')}.x`);
    assert.equal(installationName(dir), 'and-sa-1a2b3c4d');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
