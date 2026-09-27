'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

// IP de Tailscale (CGNAT 100.64.0.0/10 o fd7a:115c:a1e0::/48)
function isTailscaleIp(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  const m = /^100\.(\d+)\./.exec(s);
  if (m) { const b = Number(m[1]); return b >= 64 && b <= 127; }
  return s.toLowerCase().startsWith('fd7a:115c:a1e0:');
}

// Operaciones de sistema (solo admin): Tailscale del servidor vía weg-agent.
function createSystemRouter({ agent, isReplica = false }) {
  const router = express.Router();
  router.use(requireAdmin);
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  };
  router.get('/tailscale', wrap(() => agent.status()));
  router.post('/tailscale/login', wrap((req) => agent.login((req.body || {}).hostname)));
  router.post('/tailscale/logout', (req, res, next) => {
    // En PLANTA, desconectar desde una sesión que entra por Tailscale deja a
    // todos (incluido quien lo hace) sin acceso remoto y sin forma de volver.
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
    if (!isReplica && isTailscaleIp(ip)) {
      return res.status(409).json({ error: 'No se puede desconectar Tailscale de la planta desde una conexión por Tailscale: te quedarías sin acceso. Hacelo desde la red local de la planta.' });
    }
    next();
  }, wrap(() => agent.logout()));
  return router;
}

module.exports = createSystemRouter;
module.exports.isTailscaleIp = isTailscaleIp;
