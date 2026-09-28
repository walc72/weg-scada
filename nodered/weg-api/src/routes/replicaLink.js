'use strict';

const express = require('express');
const { requireSuperadmin } = require('../middleware/auth');
const { testLink, mask } = require('../services/replicaLink');

// Sin _conn (lleva el token en claro)
function publicResult(r) {
  const { _conn, ...rest } = r;
  return rest;
}

// Conexión de la OFICINA a planta: probar/guardar el código de enlace, ver el
// estado de la sincronización y desvincular.
function createReplicaLinkRouter({ store, isReplica, envSource, test = testLink, fetchImpl = fetch, healthUrl }) {
  const router = express.Router();
  router.use(requireSuperadmin);
  router.use((req, res, next) => {
    if (!isReplica) return res.status(409).json({ error: 'Solo disponible en un servidor réplica' });
    next();
  });

  router.get('/', (req, res) => {
    const l = store.read();
    if (l) return res.json({ configured: true, fromEnv: false, source: l.source, name: l.name, id: l.id, pairedAt: l.pairedAt, tokenMasked: mask(l.token) });
    if (envSource) return res.json({ configured: true, fromEnv: true, source: envSource, name: '(.env)', id: null, pairedAt: null, tokenMasked: '…' });
    res.json({ configured: false });
  });

  router.post('/test', async (req, res) => {
    res.json(publicResult(await test((req.body || {}).code)));
  });

  router.put('/', async (req, res) => {
    const r = await test((req.body || {}).code);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const prev = store.read();
    const prevSource = prev ? prev.source : envSource || null;
    const c = r._conn;
    store.save({ source: c.url, token: c.token, name: c.name, id: c.id, pairedAt: new Date().toISOString() });
    res.json({ ...publicResult(r), sameSource: prevSource === c.url });
  });

  router.delete('/', (req, res) => {
    store.remove();
    res.json({ ok: true });
  });

  router.get('/status', async (req, res) => {
    try {
      const r = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(5000) });
      res.json(await r.json());
    } catch {
      res.status(502).json({ error: 'El servicio de réplica no responde' });
    }
  });

  return router;
}

module.exports = createReplicaLinkRouter;
