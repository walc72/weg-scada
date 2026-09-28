'use strict';

const express = require('express');
const { requireSuperadmin } = require('../middleware/auth');

// IP de Tailscale (CGNAT 100.64.0.0/10 o fd7a:115c:a1e0::/48)
function isTailscaleIp(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  const m = /^100\.(\d+)\./.exec(s);
  if (m) { const b = Number(m[1]); return b >= 64 && b <= 127; }
  return s.toLowerCase().startsWith('fd7a:115c:a1e0:');
}

// ¿El navegador llegó por Tailscale? En la VM Docker reescribe el origen
// (X-Real-IP = gateway del bridge), así que se mira también el Host al que se
// conectó: IP de Tailscale o nombre MagicDNS (*.ts.net).
function viaTailscale(req) {
  if (isTailscaleIp(req.headers['x-real-ip'] || req.socket.remoteAddress)) return true;
  const host = String(req.headers.host || '').toLowerCase();
  const name = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '');
  return isTailscaleIp(name) || name.endsWith('.ts.net');
}

// Operaciones de sistema (solo superadmin): Tailscale del servidor vía weg-agent.
function createSystemRouter({ agent, isReplica = false }) {
  const router = express.Router();
  router.use(requireSuperadmin);
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  };
  router.get('/tailscale', wrap(() => agent.status()));
  // Sin nombre se usa el de siempre según el rol del servidor (antes solo lo
  // ponía el frontend); el agente valida el formato.
  router.post('/tailscale/login', wrap((req) => {
    const h = String((req.body || {}).hostname || '').trim().toLowerCase();
    return agent.login(h || (isReplica ? 'weg-replica' : 'weg-planta'));
  }));
  router.post('/tailscale/logout', (req, res, next) => {
    // En PLANTA, desconectar desde una sesión que entra por Tailscale deja a
    // todos (incluido quien lo hace) sin acceso remoto y sin forma de volver.
    if (!isReplica && viaTailscale(req)) {
      return res.status(409).json({ error: 'No se puede desconectar Tailscale de la planta desde una conexión por Tailscale: te quedarías sin acceso. Hacelo desde la red local de la planta.' });
    }
    next();
  }, wrap(() => agent.logout()));
  return router;
}

module.exports = createSystemRouter;
module.exports.isTailscaleIp = isTailscaleIp;
