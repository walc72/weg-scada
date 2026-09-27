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

async function serve(role, agent) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/system', createSystemRouter({ agent }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/system`;
  return { call: (m, p, b) => fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }), close: () => new Promise(r => server.close(r)) };
}

test('router: admin only, proxies, forwards agent errors', async () => {
  const agent = {
    status: async () => ({ state: 'NeedsLogin' }),
    login: async (h) => ({ state: 'NeedsLogin', authUrl: 'https://login.tailscale.com/a/x', hostname: h }),
    logout: async () => { throw Object.assign(new Error('Agente del sistema no disponible'), { status: 502 }); },
  };
  const op = await serve('operador', agent);
  try { assert.equal((await op.call('GET', '/tailscale')).status, 403); } finally { await op.close(); }
  const s = await serve('admin', agent);
  try {
    assert.equal((await (await s.call('GET', '/tailscale')).json()).state, 'NeedsLogin');
    assert.equal((await (await s.call('POST', '/tailscale/login', { hostname: 'weg-demo' })).json()).hostname, 'weg-demo');
    assert.equal((await s.call('POST', '/tailscale/logout')).status, 502);
  } finally { await s.close(); }
});
