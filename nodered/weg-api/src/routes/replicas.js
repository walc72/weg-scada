'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

// Gestión de réplicas en PLANTA: crear (devuelve el código de enlace una sola
// vez), listar y revocar. La réplica heredada del .env se muestra pero no se
// revoca desde acá.
function createReplicasRouter({ registry, isReplica, legacyToken }) {
  const router = express.Router();
  router.use(requireAdmin);
  router.use((req, res, next) => {
    if (isReplica) return res.status(409).json({ error: 'Solo disponible en planta' });
    next();
  });

  router.get('/', (req, res) => {
    const replicas = registry.list();
    if (legacyToken) replicas.unshift({ id: 'env', name: 'Réplica heredada (.env)', legacy: true, status: 'activa', createdAt: null, lastSeenAt: null, lastIp: null, revokedAt: null });
    res.json({ replicas });
  });

  router.post('/', (req, res) => {
    try {
      const { name, plantUrl } = req.body || {};
      res.json(registry.create({ name, plantUrl }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.delete('/:id', (req, res) => {
    if (req.params.id === 'env') {
      return res.status(409).json({ error: 'La réplica heredada se quita borrando REPLICA_TOKEN del .env de planta' });
    }
    try { res.json(registry.revoke(req.params.id)); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  return router;
}

module.exports = createReplicasRouter;
