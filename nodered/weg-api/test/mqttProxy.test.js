'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');
const { createMqttProxy } = require('../src/services/mqttProxy');
const { createMqttValidator } = require('../src/services/mqttAuth');

// Upstream falso: responde 101 al handshake, guarda el request y hace eco
async function fakeUpstream() {
  const seen = [];
  const server = net.createServer((sock) => {
    let buf = ''; let upgraded = false;
    sock.on('data', (d) => {
      if (upgraded) { sock.write(d); return; }
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      seen.push(buf.slice(0, i));
      upgraded = true;
      sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      const rest = buf.slice(i + 4);
      if (rest) sock.write(Buffer.from(rest, 'latin1'));
    });
    sock.on('error', () => {});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, seen, close: () => new Promise(r => server.close(r)) };
}

async function proxyServer({ validate, upstreamPort }) {
  const logs = [];
  const proxy = createMqttProxy({ validate, upstream: { host: '127.0.0.1', port: upstreamPort }, log: { log: (m) => logs.push(m), error: (m) => logs.push(m) }, sweepMs: 0 });
  const server = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  server.on('upgrade', proxy.handleUpgrade);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { proxy, logs, port: server.address().port, close: () => { proxy.stop(); return new Promise(r => server.close(r)); } };
}

// Cliente crudo: manda el handshake y devuelve la primera línea de respuesta
function rawUpgrade(port, reqPath, headers = {}) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    let buf = '';
    const closed = new Promise(r => sock.on('close', r));
    sock.on('error', () => {});
    sock.on('data', function onData(d) {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i >= 0) { sock.removeListener('data', onData); resolve({ status: buf.slice(0, buf.indexOf('\r\n')), sock, closed }); }
    });
    sock.on('close', () => resolve({ status: buf.split('\r\n')[0] || '(cerrado)', sock, closed }));
    const h = { Host: 'planta:9090', Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Protocol': 'mqtt', 'X-Real-IP': '10.0.0.9', ...headers };
    sock.write(`GET ${reqPath} HTTP/1.1\r\n` + Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
  });
}
const echo = (sock, text) => new Promise((resolve) => { sock.once('data', (d) => resolve(d.toString())); sock.write(text); });
const validTokens = { S1: 'session:S1', S2: 'session:S2', R1: 'replica:r_1', R2: 'replica:r_2' };
const validate = (c) => validTokens[c] || null;

test('token by query or header → 101 and bytes are piped', async () => {
  const up = await fakeUpstream(); const p = await proxyServer({ validate, upstreamPort: up.port });
  try {
    const a = await rawUpgrade(p.port, '/mqtt?token=S1');
    assert.match(a.status, /101/);
    assert.equal(await echo(a.sock, 'ping'), 'ping');
    const b = await rawUpgrade(p.port, '/mqtt', { Authorization: 'Bearer R1' });
    assert.match(b.status, /101/);
    assert.equal(p.proxy.count(), 2);
    a.sock.destroy(); b.sock.destroy();
  } finally { await p.close(); await up.close(); }
});

test('upstream never sees the credential', async () => {
  const up = await fakeUpstream(); const p = await proxyServer({ validate, upstreamPort: up.port });
  try {
    const a = await rawUpgrade(p.port, '/mqtt?token=S1');
    const b = await rawUpgrade(p.port, '/mqtt', { Authorization: 'Bearer R1' });
    assert.equal(up.seen.length, 2);
    for (const req of up.seen) {
      assert.match(req, /^GET \/mqtt HTTP\/1\.1\r\n/);
      assert.equal(/token=|authorization/i.test(req), false, req);
      assert.match(req, /Sec-WebSocket-Protocol: mqtt/);
    }
    assert.equal(p.logs.some(l => /S1|R1|token=/.test(l)), false, p.logs.join('\n'));
    a.sock.destroy(); b.sock.destroy();
  } finally { await p.close(); await up.close(); }
});

// En la VM todos los clientes llegan con la IP del gateway de Docker: el límite
// no puede dejar afuera a un token VÁLIDO por culpa de una pestaña vieja.
test('invalid credential → 401, after 10 → 429; a valid credential is never 429', async () => {
  const up = await fakeUpstream(); const p = await proxyServer({ validate, upstreamPort: up.port });
  try {
    for (let i = 0; i < 10; i++) assert.match((await rawUpgrade(p.port, '/mqtt?token=bad')).status, /401/);
    assert.match((await rawUpgrade(p.port, '/mqtt?token=bad')).status, /429/);
    const ok = await rawUpgrade(p.port, '/mqtt?token=S1');
    assert.match(ok.status, /101/);
    ok.sock.destroy();
  } finally { await p.close(); await up.close(); }
});

test('missing credential → 401 and does not count toward the limit', async () => {
  const up = await fakeUpstream(); const p = await proxyServer({ validate, upstreamPort: up.port });
  try {
    for (let i = 0; i < 15; i++) assert.match((await rawUpgrade(p.port, '/mqtt')).status, /401/);
    assert.match((await rawUpgrade(p.port, '/mqtt?token=bad')).status, /401/);
  } finally { await p.close(); await up.close(); }
});

test('a throwing validator answers 401 instead of crashing the process', async () => {
  const up = await fakeUpstream();
  const p = await proxyServer({ validate: () => { throw new Error('ENOSPC'); }, upstreamPort: up.port });
  try { assert.match((await rawUpgrade(p.port, '/mqtt?token=S1')).status, /401/); } finally { await p.close(); await up.close(); }
});

test('only /mqtt is proxied (case/trailing slash/query tolerated)', async () => {
  const up = await fakeUpstream(); const p = await proxyServer({ validate, upstreamPort: up.port });
  try {
    const ok = await rawUpgrade(p.port, '/MQTT/?token=S1');
    assert.match(ok.status, /101/);
    const other = await rawUpgrade(p.port, '/otra?token=S1');
    assert.doesNotMatch(other.status, /101/);
    await other.closed;
    assert.equal(up.seen.length, 1);
    ok.sock.destroy();
  } finally { await p.close(); await up.close(); }
});

test('closeIdentity closes only that identity', async () => {
  const up = await fakeUpstream(); const p = await proxyServer({ validate, upstreamPort: up.port });
  try {
    const s1 = await rawUpgrade(p.port, '/mqtt?token=S1');
    const s2 = await rawUpgrade(p.port, '/mqtt?token=S2');
    const r1 = await rawUpgrade(p.port, '/mqtt', { Authorization: 'Bearer R1' });
    const r2 = await rawUpgrade(p.port, '/mqtt', { Authorization: 'Bearer R2' });
    p.proxy.closeIdentity('session:S1');
    p.proxy.closeIdentity('replica:r_1');
    await s1.closed; await r1.closed;
    assert.equal(await echo(s2.sock, 'a'), 'a');
    assert.equal(await echo(r2.sock, 'b'), 'b');
    assert.equal(p.proxy.count(), 2);
    s2.sock.destroy(); r2.sock.destroy();
  } finally { await p.close(); await up.close(); }
});

test('sweep closes connections whose credential stopped being valid', async () => {
  const up = await fakeUpstream();
  const live = new Set(['S1', 'S2']);
  const p = await proxyServer({ validate: (c) => (live.has(c) ? `session:${c}` : null), upstreamPort: up.port });
  try {
    const a = await rawUpgrade(p.port, '/mqtt?token=S1');
    const b = await rawUpgrade(p.port, '/mqtt?token=S2');
    live.delete('S1');
    p.proxy.sweep();
    await a.closed;
    assert.equal(await echo(b.sock, 'x'), 'x');
    b.sock.destroy();
  } finally { await p.close(); await up.close(); }
});

test('upstream down → 502', async () => {
  const p = await proxyServer({ validate, upstreamPort: 1 });
  try {
    assert.match((await rawUpgrade(p.port, '/mqtt?token=S1')).status, /502/);
    assert.equal(p.proxy.count(), 0);
  } finally { await p.close(); }
});

test('validator: session, registry replica, legacy env token', () => {
  const registry = { verify: (t, ip) => (t === 'REG' ? { id: 'r_9' } : null) };
  const v = createMqttValidator({ isSessionToken: (t) => t === 'SES', registry, legacyToken: 'ENV' });
  assert.equal(v('SES', 'ip'), 'session:SES');
  assert.equal(v('REG', 'ip'), 'replica:r_9');
  assert.equal(v('ENV', 'ip'), 'replica:env');
  assert.equal(v('nada', 'ip'), null);
  assert.equal(createMqttValidator({ isSessionToken: () => false, registry, legacyToken: '' })('', 'ip'), null);
});
