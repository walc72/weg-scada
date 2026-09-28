'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { parseStatus, createTailscale, redactAuthUrls } = require('../src/tailscale');

const RUNNING = {
  BackendState: 'Running', AuthURL: '',
  Self: { HostName: 'weg-demo', UserID: 42, TailscaleIPs: ['100.92.46.17', 'fd7a::1'] },
  User: { 42: { LoginName: 'walc72@gmail.com' } },
  CurrentTailnet: { Name: 'walc72@gmail.com' },
};
const NEEDS = { BackendState: 'NeedsLogin', AuthURL: '', Self: { HostName: 'weg-demo' } };
const WITH_URL = { ...NEEDS, AuthURL: 'https://login.tailscale.com/a/abc' };

test('parseStatus maps running, needs-login and unavailable', () => {
  assert.deepEqual(parseStatus(RUNNING), { state: 'Running', tailnet: 'walc72@gmail.com', user: 'walc72@gmail.com', ip: '100.92.46.17', hostname: 'weg-demo', authUrl: null });
  assert.equal(parseStatus(WITH_URL).authUrl, 'https://login.tailscale.com/a/abc');
  assert.equal(parseStatus(null).state, 'Unavailable');
});

function fakeTs({ statuses, exists = true, upExit }) {
  const seq = [...statuses];
  const spawned = [];
  const ts = createTailscale({
    socketExists: () => exists,
    run: async (args) => {
      if (args[0] === 'logout') return { stdout: '' };
      const s = seq.length > 1 ? seq.shift() : seq[0];
      return { stdout: JSON.stringify(s) };
    },
    spawnUp: (args) => {
      const c = new EventEmitter();
      spawned.push(args);
      if (upExit) setImmediate(() => c.emit('done', upExit.code, upExit.stderr));
      return c;
    },
    // cede un turno de macrotarea (como el sleep real) para que corra el setImmediate de 'done'
    sleep: () => new Promise(r => setImmediate(r)),
    loginWaitMs: 200,
  });
  return { ts, spawned };
}

test('login spawns up once and returns the auth url', async () => {
  const { ts, spawned } = fakeTs({ statuses: [NEEDS, NEEDS, WITH_URL] });
  const st = await ts.login('weg-demo');
  assert.equal(st.authUrl, 'https://login.tailscale.com/a/abc');
  assert.deepEqual(spawned, [['up', '--hostname=weg-demo', '--timeout=0']]);
  await ts.login('weg-demo');
  assert.equal(spawned.length, 1, 'no lanza un segundo up mientras el primero sigue');
});

test('login when already running does nothing', async () => {
  const { ts, spawned } = fakeTs({ statuses: [RUNNING] });
  assert.equal((await ts.login('weg-demo')).state, 'Running');
  assert.equal(spawned.length, 0);
});

test('invalid hostname → 400; no tailscale → 409', async () => {
  const { ts } = fakeTs({ statuses: [NEEDS] });
  await assert.rejects(ts.login('Weg Demo'), (e) => e.status === 400 && /Nombre inválido/.test(e.message));
  const none = fakeTs({ statuses: [NEEDS], exists: false });
  await assert.rejects(none.ts.login('weg-demo'), (e) => e.status === 409 && e.message === 'Tailscale no está instalado en el servidor');
  assert.equal((await none.ts.status()).state, 'Unavailable');
});

test('surfaces a fast up failure', async () => {
  const { ts } = fakeTs({ statuses: [NEEDS], upExit: { code: 1, stderr: 'Error: changing settings via tailscale up requires mentioning all non-default flags' } });
  await assert.rejects(ts.login('weg-demo'), (e) => e.status === 409 && /non-default flags/.test(e.message));
});

// La salida de `tailscale up` va al log del contenedor: el link de login da
// acceso a sumar la VM a un tailnet, así que nunca debe quedar ahí.
test('redactAuthUrls hides login links and keeps the rest', () => {
  const out = redactAuthUrls('\nTo authenticate, visit:\n\n\thttps://login.tailscale.com/a/1b2c3d4e5f\n\nSuccess.\n');
  assert.equal(out.includes('1b2c3d4e5f'), false, out);
  assert.match(out, /To authenticate, visit:/);
  assert.match(out, /link de login oculto/);
  assert.match(out, /Success\./);
  assert.equal(redactAuthUrls('backend error: timeout'), 'backend error: timeout');
});

test('the error of a failed `tailscale up` never carries the login link', async () => {
  const { EventEmitter: EE } = require('events');
  let spawned;
  const ts = createTailscale({
    run: async () => ({ stdout: JSON.stringify({ BackendState: 'NeedsLogin', AuthURL: '', Self: { HostName: 'x' } }) }),
    spawnUp: () => { spawned = new EE(); return spawned; },
    socketExists: () => true,
    sleep: async () => { spawned.emit('done', 1, 'To authenticate, visit:\n\thttps://login.tailscale.com/a/SECRETO\nerror: timeout'); },
    loginWaitMs: 5000,
  });
  const e = await ts.login('weg-demo').then(() => null, (x) => x);
  assert.ok(e, 'login debía fallar');
  assert.equal(e.status, 409);
  assert.equal(e.message.includes('SECRETO'), false, e.message);
  assert.match(e.message, /timeout/);
});
