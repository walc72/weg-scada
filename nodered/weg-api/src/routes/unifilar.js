'use strict';

const express = require('express');
const requireModule = require('../middleware/requireModule');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { MESSAGE } = require('../middleware/replicaMode');

// Se monta ANTES del express.json global (1 MB): el PUT lleva su propio parser
// de 2 MB, aplicado después de autenticar y de chequear módulo/rol/réplica, así
// un anónimo no nos hace parsear 2 MB. Por montarse antes del replicaWriteGuard
// global, el rechazo en réplica se hace acá.
function createUnifilarRouter({ store, getLicense, isReplica = false }) {
  const router = express.Router();
  router.use(authenticate, requireModule(getLicense, 'unifilar'));

  router.get('/', (req, res) => {
    try { res.json(store.get()); } catch (e) { res.status(500).json({ error: `unifilar.json ilegible: ${e.message}` }); }
  });

  router.put('/', requireAdmin,
    (req, res, next) => (isReplica ? res.status(409).json({ error: MESSAGE }) : next()),
    express.json({ limit: '2mb' }),
    (req, res) => {
      const { base, data } = req.body || {};
      try {
        res.json(store.put(base, data));
      } catch (e) {
        if (e && e.status === 409) return res.status(409).json({ error: e.message });
        if (e && e.status === 400) return res.status(400).json({ error: 'Unifilar inválido', errors: e.errors });
        res.status(500).json({ error: e && e.message ? e.message : 'Error al guardar' });
      }
    });

  // body-parser: >2 MB → 413, JSON roto → 400; ambos en JSON
  router.use((err, req, res, next) => {
    if (err && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.type === 'entity.too.large' ? 'Cuerpo mayor a 2 MB' : 'JSON inválido' });
    }
    next(err);
  });
  return router;
}

module.exports = createUnifilarRouter;
