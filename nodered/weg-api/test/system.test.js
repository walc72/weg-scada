'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAgentClient } = require('../src/services/agentClient');
const createSystemRouter = require('../src/routes/system');

test('agent client sends the bearer token and maps errors', async () => {
  const calls = [];
  const ok = createAgentClient({ baseUrl: 'http://weg-agent:3400', token: 'T', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ state: 'Running' }) };
  } });
  assert.equal((await ok.status()).state, 'Running');
  await ok.login('weg-demo');
  assert.equal(calls[0].url, 'http://weg-agent:3400/tailscale/status');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer T');
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].init.body), { hostname: 'weg-demo' });

  const down = createAgentClient({ baseUrl: 'http://x', token: 'T', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(down.status(), (e) => e.status === 502 && e.message === 'Agente del sistema no disponible');

  const bad = createAgentClient({ baseUrl: 'http://x', token: 'T', fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: 'Nombre inválido (minúsculas, números y guiones)' }) }) });
  await assert.rejects(bad.login('X'), (e) => e.status === 400 && /Nombre inválido/.test(e.message));
});

async function serve(role, agent, opts = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/system', createSystemRouter({ agent, ...opts }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/system`;
  return { call: (m, p, b) => fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }), close: () => new Promise(r => server.close(r)) };
}

test('router: superadmin only, proxies, forwards agent errors', async () => {
  const agent = {
    status: async () => ({ state: 'NeedsLogin' }),
    login: async (h) => ({ state: 'NeedsLogin', authUrl: 'https://login.tailscale.com/a/x', hostname: h }),
    logout: async () => { throw Object.assign(new Error('Agente del sistema no disponible'), { status: 502 }); },
  };
  for (const role of ['operador', 'admin']) {
    const op = await serve(role, agent);
    try { assert.equal((await op.call('GET', '/tailscale')).status, 403); } finally { await op.close(); }
  }
  const s = await serve('superadmin', agent);
  try {
    assert.equal((await (await s.call('GET', '/tailscale')).json()).state, 'NeedsLogin');
    assert.equal((await (await s.call('POST', '/tailscale/login', { hostname: 'weg-demo' })).json()).hostname, 'weg-demo');
    assert.equal((await s.call('POST', '/tailscale/logout')).status, 502);
  } finally { await s.close(); }
});

test('agent 401/403 (AGENT_TOKEN mismatch) becomes 502, never a 401 that logs the admin out', async () => {
  for (const status of [401, 403]) {
    const c = createAgentClient({ baseUrl: 'http://x', token: 'T', fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: 'No autorizado' }) }) });
    await assert.rejects(c.status(), (e) => e.status === 502 && /AGENT_TOKEN no coincide/.test(e.message));
  }
});

async function serveIp(isReplica, ip, agent) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role: 'superadmin', user: 'superadmin' }; req.headers['x-real-ip'] = ip; next(); });
  app.use('/api/system', createSystemRouter({ agent, isReplica }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/system`;
  return { post: (p) => fetch(base + p, { method: 'POST' }), close: () => new Promise(r => server.close(r)) };
}

test('plant logout is refused when the admin is connected through Tailscale', async () => {
  let loggedOut = 0;
  const agent = { status: async () => ({}), login: async () => ({}), logout: async () => { loggedOut++; return { state: 'NeedsLogin' }; } };
  const viaTs = await serveIp(false, '100.92.46.17', agent);
  try {
    const r = await viaTs.post('/tailscale/logout');
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /red local/);
  } finally { await viaTs.close(); }
  const v6 = await serveIp(false, 'fd7a:115c:a1e0::5938:ea0e', agent);
  try { assert.equal((await v6.post('/tailscale/logout')).status, 409); } finally { await v6.close(); }
  const lan = await serveIp(false, '192.168.3.50', agent);
  try { assert.equal((await lan.post('/tailscale/logout')).status, 200); } finally { await lan.close(); }
  const replica = await serveIp(true, '100.92.46.17', agent);
  try { assert.equal((await replica.post('/tailscale/logout')).status, 200); } finally { await replica.close(); }
  assert.equal(loggedOut, 2);
});

// En la VM real Docker reescribe el origen (X-Real-IP = gateway 172.18.0.1):
// el guard también tiene que mirar el Host al que se conectó el navegador.
async function serveHost(host, ip, agent) {
  const app = express();
  app.use((req, res, next) => { req.auth = { role: 'superadmin', user: 'superadmin' }; req.headers['x-real-ip'] = ip; req.headers.host = host; next(); });
  app.use('/api/system', createSystemRouter({ agent, isReplica: false }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/system`;
  return { post: (p) => fetch(base + p, { method: 'POST' }), close: () => new Promise(r => server.close(r)) };
}

test('plant logout refused when the browser reached the plant by its Tailscale IP or MagicDNS name', async () => {
  const agent = { status: async () => ({}), login: async () => ({}), logout: async () => ({ state: 'NeedsLogin' }) };
  for (const [host, want] of [['100.97.47.25:9090', 409], ['monitoreo-bombeo.tailc732b2.ts.net:9090', 409], ['[fd7a:115c:a1e0::1]:9090', 409], ['192.168.3.200:9090', 200]]) {
    const s = await serveHost(host, '172.18.0.1', agent);
    try { assert.equal((await s.post('/tailscale/logout')).status, want, host); } finally { await s.close(); }
  }
});

// Sin nombre (p.ej. un cliente que no lo manda) se usa el de siempre según el rol
test('login without hostname uses the default name (weg-planta / weg-replica)', async () => {
  const agent = { status: async () => ({}), login: async (h) => ({ hostname: h }), logout: async () => ({}) };
  for (const [isReplica, expected] of [[false, 'weg-planta'], [true, 'weg-replica']]) {
    const s = await serve('superadmin', agent, { isReplica });
    try {
      assert.equal((await (await s.call('POST', '/tailscale/login', {})).json()).hostname, expected);
      assert.equal((await (await s.call('POST', '/tailscale/login', { hostname: '  ' })).json()).hostname, expected);
      assert.equal((await (await s.call('POST', '/tailscale/login', { hostname: 'Mi-VM' })).json()).hostname, 'mi-vm');
    } finally { await s.close(); }
  }
});
