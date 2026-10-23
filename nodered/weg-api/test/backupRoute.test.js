'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const license = require('../src/services/license');
const { createLicenseState } = require('../src/routes/license');
const { createBackupRouter } = require('../src/routes/backup');
const { createBackupStore } = require('../src/services/backupStore');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const LIC_OK = { modulos: ['backup'] };
const KEY = 'AAAAC3NzaC1lZDI1NTE5AAAAIPlaceholderKeyData0123456789abcdefghij';
const LINE = `192.168.3.50 ssh-ed25519 ${KEY}`;

async function serve(role = 'admin', { lic = LIC_OK, isReplica = false, timeout = 300 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-route-'));
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/backup', createBackupRouter({ configDir: dir, getLicense: () => lic, isReplica, probarTimeoutMs: timeout }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/backup`;
  const call = (method, p, body) => fetch(base + p, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    dir, call,
    file: (n) => path.join(dir, n),
    json: (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')),
    close: () => new Promise((r) => { server.close(r); fs.rmSync(dir, { recursive: true, force: true }); }),
  };
}

test('GET devuelve defaults sin persistirlos y sin secretos', async () => {
  const s = await serve();
  try {
    fs.writeFileSync(s.file('backup-secretos.json'), JSON.stringify({ frase: 'super-secreta-123', drive: { client_secret: 'cs-xyz' } }));
    fs.writeFileSync(s.file('backup-drive-token.json'), JSON.stringify({ refresh_token: 'rt-abc' }));
    const res = await s.call('GET', '/');
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.ok(!/super-secreta|cs-xyz|rt-abc/.test(text));
    const j = JSON.parse(text);
    assert.equal(j.modulo, true);
    assert.deepEqual(j.config, { frecuencia: 'diaria', hora: '03:00', copias: 30 });
    assert.deepEqual(j.historico, { frecuencia: 'semanal', hora: '03:30', copias: 12 });
    assert.equal(j.fraseConfigurada, true);
    assert.equal(j.drive.activo, false);
    assert.equal(j.sftp.puerto, 22);
    assert.equal(j.sftp.clavePublica, null);
    assert.equal(j.estado, null);
    assert.ok(!fs.existsSync(s.file('backup.json')), 'GET no persiste defaults');
  } finally { await s.close(); }
});

test('GET: clave pública, estado y disponible de Drive', async () => {
  const s = await serve();
  const prev = process.env.GOOGLE_CLIENT_ID;
  const prevS = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = 'cid';
  process.env.GOOGLE_CLIENT_SECRET = 'csec';
  try {
    fs.mkdirSync(s.file('backup-ssh'));
    fs.writeFileSync(s.file('backup-ssh/id_ed25519.pub'), 'ssh-ed25519 AAAA weg\n');
    fs.writeFileSync(s.file('backup-estado.json'), JSON.stringify({ enCurso: null }));
    const j = await (await s.call('GET', '/')).json();
    assert.equal(j.sftp.clavePublica, 'ssh-ed25519 AAAA weg');
    assert.deepEqual(j.estado, { enCurso: null });
    assert.equal(j.drive.disponible, true);
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = prev;
    if (prevS === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = prevS;
    await s.close();
  }
});

test('PUT guarda programación y SFTP (644, atómico), conserva modulo', async () => {
  const s = await serve();
  try {
    createBackupStore(s.dir).setModulo(true);
    const res = await s.call('PUT', '/', {
      config: { frecuencia: 'semanal', hora: '04:15', copias: 10 },
      sftp: { host: 'nas.local', puerto: 2222, usuario: 'weg', carpeta: '/backups/agri' },
    });
    assert.equal(res.status, 200);
    const b = s.json('backup.json');
    assert.equal(b.modulo, true);
    const { configuradoEn, ...cfgSolo } = b.config;
    assert.deepEqual(cfgSolo, { frecuencia: 'semanal', hora: '04:15', copias: 10 });
    assert.ok(Date.parse(configuradoEn), 'el servidor fija configuradoEn');
    assert.equal(b.historico, undefined, 'no crea la parte no enviada');
    // se conserva en guardados posteriores y el cliente no lo puede fijar
    await s.call('PUT', '/', { config: { frecuencia: 'diaria', configuradoEn: '2000-01-01T00:00:00Z' } });
    assert.equal(s.json('backup.json').config.configuradoEn, configuradoEn);
    assert.equal(b.sftp.host, 'nas.local');
    assert.equal(b.sftp.activo, false);
    if (process.platform !== 'win32') assert.equal(fs.statSync(s.file('backup.json')).mode & 0o777, 0o644);
    assert.deepEqual(fs.readdirSync(s.dir).filter((n) => n.endsWith('.tmp')), []);
    const j = await (await s.call('GET', '/')).json();
    assert.equal(j.sftp.puerto, 2222);
    assert.equal(j.config.hora, '04:15');
  } finally { await s.close(); }
});

test('PUT valida con mensajes en español', async () => {
  const s = await serve();
  try {
    const bad = [
      [{ config: { frecuencia: 'cada-tanto' } }, /Frecuencia/],
      [{ config: { hora: '25:00' } }, /Hora/],
      [{ historico: { copias: 0 } }, /Copias/],
      [{ historico: { copias: 366 } }, /Copias/],
      [{ historico: { copias: 1.5 } }, /Copias/],
      [{ sftp: { host: '-oProxy=x' } }, /Servidor/],
      [{ sftp: { host: 'a b' } }, /Servidor/],
      [{ sftp: { puerto: 70000 } }, /Puerto/],
      [{ sftp: { usuario: 'a b' } }, /Usuario/],
      [{ sftp: { carpeta: 'relativa' } }, /absoluta/],
      [{ sftp: { carpeta: '/a\nb' } }, /absoluta/],
      [{ drive: { activo: 'si' } }, /activo/],
    ];
    for (const [body, re] of bad) {
      const res = await s.call('PUT', '/', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match((await res.json()).error, re);
    }
    assert.ok(!fs.existsSync(s.file('backup.json')));
  } finally { await s.close(); }
});

test('PUT no acepta secretos ni huella', async () => {
  const s = await serve();
  try {
    await s.call('PUT', '/', { sftp: { host: 'h', usuario: 'u', huella: 'SHA256:x', frase: 'zzz' }, frase: 'zzz', secreto: 1 });
    const raw = fs.readFileSync(s.file('backup.json'), 'utf8');
    assert.ok(!/zzz|SHA256|secreto/.test(raw));
    assert.ok(!fs.existsSync(s.file('backup-secretos.json')));
  } finally { await s.close(); }
});

test('activar un destino sin frase da 400; con frase pasa', async () => {
  const s = await serve();
  try {
    let res = await s.call('PUT', '/', { sftp: { activo: true, host: 'h', usuario: 'u' } });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Cargá la frase del backup antes de activar un destino');
    res = await s.call('PUT', '/', { drive: { activo: true } });
    assert.equal(res.status, 400);
    await s.call('PUT', '/frase', { frase: 'una frase larga ok' });
    res = await s.call('PUT', '/', { sftp: { activo: true, host: 'h', usuario: 'u' } });
    assert.equal(res.status, 200);
    assert.equal(s.json('backup.json').sftp.activo, true);
  } finally { await s.close(); }
});

test('frase: corta 400, con salto de línea 400, guarda 600, aviso al cambiar, conserva claves', async () => {
  const s = await serve();
  try {
    assert.equal((await s.call('PUT', '/frase', { frase: 'corta' })).status, 400);
    assert.equal((await s.call('PUT', '/frase', { frase: 'doce caracteres\nsegunda' })).status, 400);
    let res = await s.call('PUT', '/frase', { frase: 'primera frase larga' });
    assert.deepEqual(await res.json(), { ok: true });
    if (process.platform !== 'win32') assert.equal(fs.statSync(s.file('backup-secretos.json')).mode & 0o777, 0o600);
    const sec = s.json('backup-secretos.json');
    sec.drive = { client_id: 'a', client_secret: 'b' };
    fs.writeFileSync(s.file('backup-secretos.json'), JSON.stringify(sec));
    res = await s.call('PUT', '/frase', { frase: 'segunda frase larga' });
    assert.deepEqual(await res.json(), { ok: true, aviso: 'Los backups anteriores siguen necesitando la frase anterior' });
    assert.deepEqual(s.json('backup-secretos.json'), { frase: 'segunda frase larga', drive: { client_id: 'a', client_secret: 'b' } });
    assert.equal((await (await s.call('GET', '/')).json()).fraseConfigurada, true);
  } finally { await s.close(); }
});

test('ahora escribe el pedido', async () => {
  const s = await serve();
  try {
    assert.equal((await s.call('POST', '/ahora', { partes: ['x'] })).status, 400);
    assert.equal((await s.call('POST', '/ahora', { partes: [] })).status, 400);
    assert.equal((await s.call('POST', '/ahora', { partes: ['config'] })).status, 200);
    const p = s.json('backup-pedido.json');
    assert.deepEqual(p.partes, ['config']);
    assert.equal(typeof p.ts, 'number');
    await s.call('POST', '/ahora', {});
    assert.deepEqual(s.json('backup-pedido.json').partes, ['config', 'historico']);
  } finally { await s.close(); }
});

test('permisos: operador 403 (GET y PUT), sin módulo, réplica', async () => {
  let s = await serve('operador');
  try {
    assert.equal((await s.call('GET', '/')).status, 403);
    assert.equal((await s.call('PUT', '/', {})).status, 403);
  } finally { await s.close(); }

  s = await serve('superadmin', { lic: { modulos: [] } });
  try {
    assert.deepEqual(await (await s.call('GET', '/')).json(), { modulo: false });
    assert.equal((await s.call('PUT', '/', { config: {} })).status, 403);
    assert.equal((await s.call('PUT', '/frase', { frase: 'una frase larga ok' })).status, 403);
    assert.equal((await s.call('POST', '/ahora', {})).status, 403);
    assert.equal((await s.call('POST', '/sftp/probar')).status, 403);
    assert.ok(!fs.existsSync(s.file('backup-secretos.json')));
  } finally { await s.close(); }

  s = await serve('admin', { isReplica: true });
  try {
    assert.deepEqual(await (await s.call('GET', '/')).json(), { modulo: false, replica: true });
    assert.equal((await s.call('PUT', '/', {})).status, 403);
    assert.equal((await s.call('POST', '/ahora', {})).status, 403);
  } finally { await s.close(); }
});

test('probar: espera el resultado con el mismo ts', async () => {
  const s = await serve('admin', { timeout: 3000 });
  try {
    // weg-backup simulado: responde primero con un ts viejo y después con el correcto
    const t = setInterval(() => {
      try {
        const p = s.json('backup-prueba.json');
        fs.writeFileSync(s.file('backup-prueba-resultado.json'), JSON.stringify({ destino: 'drive', ts: 1, ok: false }));
        setTimeout(() => fs.writeFileSync(s.file('backup-prueba-resultado.json'), JSON.stringify({ destino: p.destino, ts: p.ts, ok: true })), 100);
        clearInterval(t);
      } catch { /* aún no hay pedido */ }
    }, 20);
    const res = await s.call('POST', '/drive/probar');
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.ok, true);
    assert.equal(j.destino, 'drive');
    assert.equal((await s.call('POST', '/otro/probar')).status, 404);
  } finally { await s.close(); }
});

test('probar: 504 si nadie responde', async () => {
  const s = await serve('admin', { timeout: 250 });
  try {
    const res = await s.call('POST', '/sftp/probar');
    assert.equal(res.status, 504);
    assert.equal((await res.json()).error, 'El servicio de backup no respondió (¿hay un backup en curso?)');
  } finally { await s.close(); }
});

function respondSftp(s, extra) {
  const t = setInterval(() => {
    try {
      const p = s.json('backup-prueba.json');
      fs.writeFileSync(s.file('backup-prueba-resultado.json'), JSON.stringify({ destino: 'sftp', ts: p.ts, ok: false, ...extra }));
      clearInterval(t);
    } catch { /* aún no */ }
  }, 20);
}

test('huella: agrega solo líneas validas a known_hosts y guarda sftp.huella', async () => {
  const s = await serve('admin', { timeout: 3000 });
  try {
    await s.call('PUT', '/', { sftp: { host: '192.168.3.50', puerto: 2222, usuario: 'weg' } });
    respondSftp(s, { huella: 'SHA256:abc', knownHostsLine: `${LINE}\n[192.168.3.50]:2222 ecdsa-sha2-nistp256 ${KEY}` });
    const pr = await (await s.call('POST', '/sftp/probar')).json();
    assert.equal(pr.huella, 'SHA256:abc');
    assert.equal(pr.knownHostsLine, undefined, 'la línea no sale al cliente');

    assert.equal((await s.call('POST', '/sftp/huella', { huella: 'SHA256:otra' })).status, 400);
    assert.equal((await s.call('POST', '/sftp/huella', { huella: 'SHA256:abc' })).status, 200);
    const kh = fs.readFileSync(s.file('backup-ssh/known_hosts'), 'utf8');
    assert.equal(kh, `${LINE}\n[192.168.3.50]:2222 ecdsa-sha2-nistp256 ${KEY}\n`);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(s.file('backup-ssh')).mode & 0o777, 0o700);
      assert.equal(fs.statSync(s.file('backup-ssh/known_hosts')).mode & 0o777, 0o644);
    }
    assert.equal(s.json('backup.json').sftp.huella, 'SHA256:abc');
    assert.equal(s.json('backup.json').sftp.host, '192.168.3.50');
    // idempotente: no duplica
    await s.call('POST', '/sftp/huella', { huella: 'SHA256:abc' });
    assert.equal(fs.readFileSync(s.file('backup-ssh/known_hosts'), 'utf8'), kh);
    // cambiar el host invalida la huella
    await s.call('PUT', '/', { sftp: { host: 'otro.local' } });
    assert.equal(s.json('backup.json').sftp.huella, undefined);
  } finally { await s.close(); }
});

test('huella: knownHostsLine con líneas inválidas se rechaza', async () => {
  const s = await serve('admin', { timeout: 3000 });
  try {
    await s.call('PUT', '/', { sftp: { host: '192.168.3.50', usuario: 'weg' } });
    respondSftp(s, { huella: 'SHA256:evil', knownHostsLine: `${LINE}\nevil.com ssh-rsa AAAA\n@cert-authority * ssh-rsa AAAA` });
    const pr = await (await s.call('POST', '/sftp/probar')).json();
    assert.equal(pr.ok, false);
    assert.equal((await s.call('POST', '/sftp/huella', { huella: 'SHA256:evil' })).status, 400);
    assert.ok(!fs.existsSync(s.file('backup-ssh/known_hosts')));
  } finally { await s.close(); }
});

test('modulo: setModulo no crea config/historico y se refleja al cambiar la licencia', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-mod-'));
  try {
    const st = createLicenseState({ configDir: dir, publicKey: PEM, interval: 50 });
    const store = createBackupStore(dir);
    const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'backup.json'), 'utf8'));
    store.setModulo(false);
    assert.deepEqual(read(), { modulo: false });
    store.setModulo(true);
    assert.deepEqual(read(), { modulo: true });
    assert.ok(typeof st.reload === 'function');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('createLicenseState llama onReload al crear y en cada recarga', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-hook-'));
  try {
    license.ensureInstallId(dir);
    const seen = [];
    const st = createLicenseState({ configDir: dir, publicKey: PEM, interval: 50, onReload: (l) => seen.push(l.ok) });
    assert.equal(seen.length, 1);
    st.reload();
    assert.equal(seen.length, 2);
    const w = st.watch();
    await new Promise((r) => setTimeout(r, 300));
    fs.writeFileSync(path.join(dir, 'license.key'), 'basura');
    await new Promise((r) => setTimeout(r, 600));
    await w.close();
    assert.ok(seen.length >= 3, `recargas: ${seen.length}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('lectura rota: setModulo no reescribe, PUT y frase dan 500 sin tocar archivos', async () => {
  const s = await serve();
  try {
    fs.writeFileSync(s.file('backup.json'), '{ roto');
    assert.throws(() => createBackupStore(s.dir).setModulo(true), /backup.json/);
    assert.equal(fs.readFileSync(s.file('backup.json'), 'utf8'), '{ roto');
    let res = await s.call('PUT', '/', { config: { copias: 5 } });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, 'No pude leer la configuración de backup');
    assert.equal(fs.readFileSync(s.file('backup.json'), 'utf8'), '{ roto');

    fs.writeFileSync(s.file('backup-secretos.json'), 'basura');
    res = await s.call('PUT', '/frase', { frase: 'una frase larga ok' });
    assert.equal(res.status, 500);
    assert.equal(fs.readFileSync(s.file('backup-secretos.json'), 'utf8'), 'basura');
  } finally { await s.close(); }
});

test('huella: la prueba debe ser del host actual y las líneas del host exacto', async () => {
  const s = await serve('admin', { timeout: 3000 });
  try {
    await s.call('PUT', '/', { sftp: { host: 'a.local', usuario: 'weg' } });
    respondSftp(s, { huella: 'SHA256:A', knownHostsLine: `a.local ssh-ed25519 ${KEY}` });
    await s.call('POST', '/sftp/probar');
    await s.call('PUT', '/', { sftp: { host: 'b.local' } });
    const res = await s.call('POST', '/sftp/huella', { huella: 'SHA256:A' });
    assert.equal(res.status, 400); // PUT al cambiar de host descartó la prueba
    assert.ok(!fs.existsSync(s.file('backup-ssh/known_hosts')));

    // línea con patrón: rechazada aunque el formato sea válido
    respondSftp(s, { huella: 'SHA256:B', knownHostsLine: `* ssh-ed25519 ${KEY}` });
    const pr = await (await s.call('POST', '/sftp/probar')).json();
    assert.equal(pr.ok, false);
    assert.equal((await s.call('POST', '/sftp/huella', { huella: 'SHA256:B' })).status, 400);
    assert.equal(s.json('backup.json').sftp.huella, undefined);
  } finally { await s.close(); }
});

test('huella: host cambiado en disco entre prueba y aceptación da 409', async () => {
  const s = await serve('admin', { timeout: 3000 });
  try {
    await s.call('PUT', '/', { sftp: { host: 'a.local', usuario: 'weg' } });
    respondSftp(s, { huella: 'SHA256:A', knownHostsLine: `a.local ssh-ed25519 ${KEY}` });
    await s.call('POST', '/sftp/probar');
    const b = s.json('backup.json');
    b.sftp.host = 'b.local';
    fs.writeFileSync(s.file('backup.json'), JSON.stringify(b));
    const res = await s.call('POST', '/sftp/huella', { huella: 'SHA256:A' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'La prueba fue para otro equipo; volvé a probar');
  } finally { await s.close(); }
});

test('probar: una a la vez por destino (409)', async () => {
  const s = await serve('admin', { timeout: 600 });
  try {
    const first = s.call('POST', '/drive/probar');
    await new Promise((r) => setTimeout(r, 100));
    const res = await s.call('POST', '/drive/probar');
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'Ya hay una prueba en curso');
    assert.equal((await first).status, 504);
    assert.equal((await s.call('POST', '/drive/probar')).status, 504, 'se libera al terminar');
  } finally { await s.close(); }
});

test('validación: usuario no empieza con "-", carpeta sin caracteres de control', async () => {
  const s = await serve();
  try {
    assert.equal((await s.call('PUT', '/', { sftp: { usuario: '-oFoo' } })).status, 400);
    assert.equal((await s.call('PUT', '/', { sftp: { carpeta: '/a\tb' } })).status, 400);
    assert.equal((await s.call('PUT', '/', { sftp: { usuario: 'weg.1', carpeta: '/ok' } })).status, 200);
  } finally { await s.close(); }
});

test('modulo sigue una licencia firmada real (mismo cableado que server.js)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lic-'));
  try {
    const installId = license.ensureInstallId(dir);
    const store = createBackupStore(dir);
    const state = createLicenseState({
      configDir: dir, publicKey: PEM,
      onReload: (lic) => store.setModulo(license.hasModule(lic, 'backup')),
    });
    const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'backup.json'), 'utf8'));
    assert.deepEqual(read(), { modulo: false });
    const sign = (modulos) => license.sign({ v: 1, installId, cliente: 'ACME', modulos, limites: { A: 5, B: 5, C: 1 } }, privateKey);
    fs.writeFileSync(path.join(dir, 'license.key'), sign(['backup']));
    state.reload();
    assert.deepEqual(read(), { modulo: true });
    fs.writeFileSync(path.join(dir, 'license.key'), sign(['medidores']));
    state.reload();
    assert.deepEqual(read(), { modulo: false });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST /sftp/clave genera la clave y GET la devuelve', async () => {
  const s = await serve();
  try {
    const r = await s.call('POST', '/sftp/clave');
    const { clavePublica } = await r.json();
    assert.match(clavePublica, /^ssh-ed25519 \S+ weg-scada-sin-licencia-00000000$/);
    assert.equal((await (await s.call('GET', '/')).json()).sftp.clavePublica, clavePublica);
    assert.equal((await (await s.call('POST', '/sftp/clave')).json()).clavePublica, clavePublica);
  } finally { await s.close(); }
});

test('POST /sftp/clave con privada danada -> 500 y no la pisa', async () => {
  const s = await serve();
  try {
    fs.mkdirSync(s.file('backup-ssh'));
    fs.writeFileSync(s.file('backup-ssh/id_ed25519'), 'basura');
    const r = await s.call('POST', '/sftp/clave');
    assert.equal(r.status, 500);
    assert.match((await r.json()).error, /dañada/);
    assert.equal(fs.readFileSync(s.file('backup-ssh/id_ed25519'), 'utf8'), 'basura');
  } finally { await s.close(); }
});

test('usar el módulo guarda las partes faltantes; GET y setModulo nunca', async () => {
  const s = await serve();
  try {
    createBackupStore(s.dir).setModulo(true);
    let j = await (await s.call('GET', '/')).json();
    assert.deepEqual(j.guardado, { config: false, historico: false });
    assert.deepEqual(s.json('backup.json'), { modulo: true }, 'GET no agrega partes');
    // un PUT de SFTP sin activar tampoco
    await s.call('PUT', '/', { sftp: { host: 'h', usuario: 'u' } });
    assert.equal(s.json('backup.json').config, undefined);
    await s.call('PUT', '/frase', { frase: 'una frase larga ok' });
    assert.equal((await s.call('PUT', '/', { sftp: { activo: true } })).status, 200);
    const b = s.json('backup.json');
    assert.equal(b.modulo, true);
    for (const p of ['config', 'historico']) assert.ok(Date.parse(b[p].configuradoEn), `${p} con configuradoEn`);
    assert.equal(b.config.frecuencia, 'diaria');
    assert.equal(b.historico.frecuencia, 'semanal');
    j = await (await s.call('GET', '/')).json();
    assert.deepEqual(j.guardado, { config: true, historico: true });
  } finally { await s.close(); }
});

test('ahora en un módulo sin partes las guarda; si ya están, no las toca', async () => {
  const s = await serve();
  try {
    createBackupStore(s.dir).setModulo(true);
    assert.equal((await s.call('POST', '/ahora', { partes: ['config'] })).status, 200);
    const b = s.json('backup.json');
    assert.equal(b.modulo, true);
    assert.equal(b.config.hora, '03:00');
    assert.equal(b.historico.hora, '03:30');
    const raw = fs.readFileSync(s.file('backup.json'), 'utf8');
    await s.call('POST', '/ahora', {});
    assert.equal(fs.readFileSync(s.file('backup.json'), 'utf8'), raw);
  } finally { await s.close(); }
});

test('configuradoEn se renueva al pasar de desactivada a una frecuencia activa', async () => {
  const s = await serve();
  try {
    fs.writeFileSync(s.file('backup.json'), JSON.stringify({ modulo: true, config: { frecuencia: 'desactivada', hora: '03:00', copias: 30, configuradoEn: '2020-01-01T00:00:00.000Z' } }));
    await s.call('PUT', '/', { config: { frecuencia: 'desactivada', hora: '04:00' } });
    assert.equal(s.json('backup.json').config.configuradoEn, '2020-01-01T00:00:00.000Z', 'sigue desactivada: se conserva');
    await s.call('PUT', '/', { config: { frecuencia: 'diaria' } });
    const c = s.json('backup.json').config.configuradoEn;
    assert.ok(Date.now() - Date.parse(c) < 60000, 'reactivada: configuradoEn = ahora');
    await s.call('PUT', '/', { config: { frecuencia: 'semanal' } });
    assert.equal(s.json('backup.json').config.configuradoEn, c, 'entre frecuencias activas se conserva');
  } finally { await s.close(); }
});

test('probar: la API espera 55 s y nginx da 90 s a /api/backup/', () => {
  const { PROBAR_TIMEOUT_MS } = require('../src/routes/backup');
  assert.equal(PROBAR_TIMEOUT_MS, 55000);
  const conf = fs.readFileSync(path.join(__dirname, '../../nginx/frontend.conf'), 'utf8');
  const m = conf.match(/location \/api\/backup\/ \{[^}]*proxy_read_timeout (\d+)s;/);
  assert.ok(m, 'location /api/backup/ con proxy_read_timeout');
  assert.ok(Number(m[1]) * 1000 > PROBAR_TIMEOUT_MS + 10000);
});
