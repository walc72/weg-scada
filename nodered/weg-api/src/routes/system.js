'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

// Operaciones de sistema (solo admin): Tailscale del servidor vía weg-agent.
function createSystemRouter({ agent }) {
  const router = express.Router();
  router.use(requireAdmin);
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  };
  router.get('/tailscale', wrap(() => agent.status()));
  router.post('/tailscale/login', wrap((req) => agent.login((req.body || {}).hostname)));
  router.post('/tailscale/logout', wrap(() => agent.logout()));
  return router;
}

module.exports = createSystemRouter;
