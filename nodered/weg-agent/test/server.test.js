'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentServer } = require('../src/server');

async function serve(token, tailscale) {
  const server = createAgentServer({ token, tailscale, log: { error() {} } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, p, { tok = token, body } = {}) => fetch(base + p, { method: m, headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { call, close: () => new Promise(r => server.close(r)) };
}
const ts = {
  status: async () => ({ state: 'Running' }),
  login: async (h) => { if (h === 'BAD') throw Object.assign(new Error('Nombre inválido (minúsculas, números y guiones)'), { status: 400 }); return { state: 'NeedsLogin', hostname: h }; },
  logout: async () => ({ state: 'NeedsLogin' }),
};

test('health is public; everything else needs the token', async () => {
  const s = await serve('T', ts);
  try {
    assert.equal((await s.call('GET', '/health', { tok: '' })).status, 200);
    assert.equal((await s.call('GET', '/tailscale/status', { tok: '' })).status, 401);
    assert.equal((await s.call('GET', '/tailscale/status', { tok: 'X' })).status, 401);
    assert.equal((await (await s.call('GET', '/tailscale/status')).json()).state, 'Running');
    assert.equal((await (await s.call('POST', '/tailscale/login', { body: { hostname: 'weg-demo' } })).json()).hostname, 'weg-demo');
    assert.equal((await s.call('POST', '/tailscale/login', { body: { hostname: 'BAD' } })).status, 400);
    assert.equal((await s.call('POST', '/tailscale/logout')).status, 200);
    assert.equal((await s.call('GET', '/otra')).status, 404);
  } finally { await s.close(); }
});

test('no AGENT_TOKEN configured → 503', async () => {
  const s = await serve('', ts);
  try { assert.equal((await s.call('GET', '/tailscale/status', { tok: 'x' })).status, 503); } finally { await s.close(); }
});
