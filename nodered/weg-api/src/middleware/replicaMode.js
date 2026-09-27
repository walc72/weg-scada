'use strict';

// Servidor RÉPLICA (oficina): la config de equipos, los setpoints y los datos
// manuales vienen de planta y weg-replica los pisa en cada sincronización →
// se rechazan esas escrituras en vez de guardarlas para perderlas después.
// Usuarios, SMTP y branding siguen siendo locales y editables.

const { normPath } = require('./pathMatch');

const WRITE_METHODS = new Set(['PUT', 'POST', 'DELETE', 'PATCH']);
const MESSAGE = 'Servidor réplica — los cambios se hacen en planta';

function isReplicaMode() {
  return ['1', 'true', 'yes'].includes(String(process.env.REPLICA_MODE || '').toLowerCase());
}

function replicaWriteGuard(enabled) {
  return (req, res, next) => {
    if (!enabled || !WRITE_METHODS.has(req.method)) return next();
    const p = normPath(req.path);
    if (p.startsWith('/api/config') || p.startsWith('/api/setpoints') || p === '/api/reports/manual') {
      return res.status(409).json({ error: MESSAGE });
    }
    next();
  };
}

module.exports = { isReplicaMode, replicaWriteGuard, MESSAGE };
