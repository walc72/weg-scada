'use strict';

const http = require('http');
const crypto = require('crypto');

function tokenMatches(input, expected) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// Solo tres operaciones fijas; sin ejecución de comandos arbitrarios.
function createAgentServer({ token, tailscale, log = console }) {
  return http.createServer(async (req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const url = (req.url || '').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(200, { ok: true });
    if (!token) return send(503, { error: 'AGENT_TOKEN no configurado' });
    const h = req.headers.authorization || '';
    const got = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!got || !tokenMatches(got, token)) return send(401, { error: 'No autorizado' });
    try {
      if (req.method === 'GET' && url === '/tailscale/status') return send(200, await tailscale.status());
      if (req.method === 'POST' && url === '/tailscale/login') return send(200, await tailscale.login((await readJson(req)).hostname));
      if (req.method === 'POST' && url === '/tailscale/logout') return send(200, await tailscale.logout());
      return send(404, { error: 'No encontrado' });
    } catch (e) {
      log.error(`[AGENT] ${e.message}`);
      return send(e.status || 500, { error: e.message });
    }
  });
}

module.exports = { createAgentServer };
